import argon2 from "argon2";
import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth.middleware";
import { logAccess } from "../services/audit.service";
import { blobExists, deleteBlob, getBlobReadStream } from "../services/storage.service";

export const blobRouter = Router();

/**
 * Authorisation helper: checks expiry, revocation, and download limits for a share link.
 */
async function validateShareLink(token: string, req: Request) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { item: true },
  });

  if (!link) {
    return { ok: false as const, status: 404, error: "Share link not found" };
  }

  const now = new Date();
  if (link.isRevoked || link.item.isRevoked) {
    await logAccess({ itemId: link.itemId, shareLinkId: link.id, action: "DENIED_REVOKED", req });
    return { ok: false as const, status: 410, error: "This link has been revoked" };
  }

  if (link.expiresAt <= now || link.item.expiresAt <= now) {
    await logAccess({ itemId: link.itemId, shareLinkId: link.id, action: "DENIED_EXPIRED", req });
    return { ok: false as const, status: 410, error: "This link has expired" };
  }

  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
    await logAccess({ itemId: link.itemId, shareLinkId: link.id, action: "DENIED_LIMIT", req });
    return { ok: false as const, status: 410, error: "Download limit reached" };
  }

  return { ok: true as const, link };
}

/**
 * Fetch encrypted metadata and link status before downloading/decrypting.
 */
blobRouter.get("/:token/meta", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = String(req.params.token);
    const check = await validateShareLink(token, req);
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { link } = check;
    await logAccess({ itemId: link.itemId, shareLinkId: link.id, action: "VIEW_META", req });

    res.json({
      itemId: link.item.id,
      itemType: link.item.itemType,
      encryptedMetadata: link.item.encryptedMetadata,
      metadataIv: link.item.metadataIv,
      fileIv: link.item.fileIv,
      sha256Checksum: link.item.sha256Checksum,
      sizeBytes: link.item.sizeBytes,
      expiresAt: link.expiresAt,
      requiresPassword: Boolean(link.passwordHash),
      isPassphraseProtected: link.isPassphraseProtected,
      burnAfterReading: link.burnAfterReading,
      remainingDownloads:
        link.maxDownloads !== null ? Math.max(0, link.maxDownloads - link.downloadCount) : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Download ciphertext via share link (atomic counter increment + burn-after-reading).
 */
blobRouter.post("/:token/download", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = String(req.params.token);
    const check = await validateShareLink(token, req);
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { link } = check;

    if (link.passwordHash) {
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const valid = password ? await argon2.verify(link.passwordHash, password) : false;
      if (!valid) {
        await logAccess({
          itemId: link.itemId,
          shareLinkId: link.id,
          action: "DENIED_PASSWORD",
          req,
        });
        res.status(401).json({ error: "Incorrect link password" });
        return;
      }
    }

    // Atomic conditional increment prevents concurrent race conditions on download limits
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.shareLink.updateMany({
        where: {
          id: link.id,
          isRevoked: false,
          ...(link.maxDownloads !== null ? { downloadCount: { lt: link.maxDownloads } } : {}),
        },
        data: { downloadCount: { increment: 1 } },
      });

      if (result.count === 0) return null;

      return tx.shareLink.findUnique({
        where: { id: link.id },
        include: { item: true },
      });
    });

    if (!updated) {
      await logAccess({ itemId: link.itemId, shareLinkId: link.id, action: "DENIED_LIMIT", req });
      res.status(410).json({ error: "Download limit reached" });
      return;
    }

    const shouldBurn =
      updated.burnAfterReading ||
      (updated.maxDownloads !== null && updated.downloadCount >= updated.maxDownloads);

    if (updated.item.itemType === "SECRET_NOTE") {
      const payload = updated.item.encryptedPayload;
      await logAccess({
        itemId: updated.itemId,
        shareLinkId: updated.id,
        action: updated.burnAfterReading ? "BURNED" : "DOWNLOAD_SUCCESS",
        req,
      });

      if (updated.burnAfterReading) {
        await prisma.vaultItem.delete({ where: { id: updated.itemId } });
      } else if (shouldBurn) {
        await prisma.shareLink.update({ where: { id: updated.id }, data: { isRevoked: true } });
      }

      res.json({
        itemType: "SECRET_NOTE",
        encryptedPayload: payload,
        fileIv: updated.item.fileIv,
        encryptedMetadata: updated.item.encryptedMetadata,
        metadataIv: updated.item.metadataIv,
        sha256Checksum: updated.item.sha256Checksum,
      });
      return;
    }

    // FILE download
    const blobKey = updated.item.blobKey;
    if (!blobKey || !(await blobExists(blobKey))) {
      res.status(404).json({ error: "Encrypted blob no longer exists" });
      return;
    }

    await logAccess({
      itemId: updated.itemId,
      shareLinkId: updated.id,
      action: updated.burnAfterReading ? "BURNED" : "DOWNLOAD_SUCCESS",
      req,
    });

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-VaultX-File-IV", updated.item.fileIv);
    res.setHeader("X-VaultX-SHA256", updated.item.sha256Checksum);

    const stream = getBlobReadStream(blobKey);
    stream.on("error", (err) => next(err));
    stream.on("close", async () => {
      if (updated.burnAfterReading) {
        await deleteBlob(blobKey).catch(() => {});
        await prisma.vaultItem.delete({ where: { id: updated.itemId } }).catch(() => {});
      } else if (shouldBurn) {
        await prisma.shareLink
          .update({ where: { id: updated.id }, data: { isRevoked: true } })
          .catch(() => {});
      }
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

/**
 * Authenticated registered-user download via RecipientKey.
 */
blobRouter.post(
  "/recipient/:itemId/download",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = String(req.params.itemId);
      const userId = req.user!.userId;

      const recKey = await prisma.recipientKey.findUnique({
        where: { itemId_recipientId: { itemId, recipientId: userId } },
        include: { item: true },
      });

      if (!recKey || recKey.isRevoked || recKey.item.isRevoked) {
        res.status(404).json({ error: "Shared item not found or revoked" });
        return;
      }

      if (recKey.item.expiresAt <= new Date()) {
        await logAccess({
          itemId,
          accessorUserId: userId,
          action: "DENIED_EXPIRED",
          req,
        });
        res.status(410).json({ error: "Item has expired" });
        return;
      }

      const updated = await prisma.recipientKey.updateMany({
        where: {
          id: recKey.id,
          isRevoked: false,
          ...(recKey.maxDownloads !== null
            ? { downloadCount: { lt: recKey.maxDownloads } }
            : {}),
        },
        data: { downloadCount: { increment: 1 } },
      });

      if (updated.count === 0) {
        await logAccess({
          itemId,
          accessorUserId: userId,
          action: "DENIED_LIMIT",
          req,
        });
        res.status(410).json({ error: "Download limit reached" });
        return;
      }

      await logAccess({
        itemId,
        accessorUserId: userId,
        action: recKey.burnAfterReading ? "BURNED" : "DOWNLOAD_SUCCESS",
        req,
      });

      if (recKey.item.itemType === "SECRET_NOTE") {
        const payload = recKey.item.encryptedPayload;
        if (recKey.burnAfterReading) {
          await prisma.recipientKey.delete({ where: { id: recKey.id } });
        }
        res.json({
          itemType: "SECRET_NOTE",
          wrappedAesKey: recKey.wrappedAesKey,
          encryptedPayload: payload,
          fileIv: recKey.item.fileIv,
          encryptedMetadata: recKey.item.encryptedMetadata,
          metadataIv: recKey.item.metadataIv,
          sha256Checksum: recKey.item.sha256Checksum,
        });
        return;
      }

      const blobKey = recKey.item.blobKey;
      if (!blobKey || !(await blobExists(blobKey))) {
        res.status(404).json({ error: "Encrypted blob no longer exists" });
        return;
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("X-VaultX-Wrapped-Key", recKey.wrappedAesKey);
      res.setHeader("X-VaultX-File-IV", recKey.item.fileIv);
      res.setHeader("X-VaultX-SHA256", recKey.item.sha256Checksum);

      const stream = getBlobReadStream(blobKey);
      stream.on("error", (err) => next(err));
      stream.on("close", async () => {
        if (recKey.burnAfterReading) {
          await prisma.recipientKey.delete({ where: { id: recKey.id } }).catch(() => {});
        }
      });
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
);
