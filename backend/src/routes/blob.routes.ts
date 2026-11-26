import argon2 from "argon2";
import { Router, Request, Response, NextFunction } from "express";
import { db, parseUtcDate, Row, toUtcIso, unwrap } from "../lib/db";
import { requireAuth } from "../middleware/auth.middleware";
import { logAccess } from "../services/audit.service";
import { readBlobBuffer } from "../services/storage.service";

export const blobRouter = Router();

/**
 * Public share links need NO account. A share is independent of the file:
 * a link/recipient being used up or burned only disables THAT share, never the file.
 */
async function validateShareLink(token: string, req: Request) {
  const link = unwrap(
    await db().from("ShareLink").select("*").eq("token", token).maybeSingle()
  ) as Row | null;
  if (!link) return { ok: false as const, status: 404, error: "Share link not found" };

  const item = unwrap(
    await db().from("VaultItem").select("*").eq("id", link.itemId).maybeSingle()
  ) as Row | null;
  if (!item) return { ok: false as const, status: 404, error: "File no longer exists" };

  const now = new Date();
  const base = { itemId: item.id as string, shareLinkId: link.id as string, req };

  if (link.isRevoked || item.isRevoked) {
    await logAccess({ ...base, action: "DENIED_REVOKED" });
    return { ok: false as const, status: 410, error: "This link has been revoked" };
  }
  if (parseUtcDate(link.expiresAt) <= now || parseUtcDate(item.expiresAt) <= now) {
    await logAccess({ ...base, action: "DENIED_EXPIRED" });
    return { ok: false as const, status: 410, error: "This link has expired" };
  }
  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
    await logAccess({ ...base, action: "DENIED_LIMIT" });
    return { ok: false as const, status: 410, error: "Download limit reached" };
  }

  return { ok: true as const, link, item };
}

/** Link metadata (encrypted). No account needed. */
blobRouter.get("/:token/meta", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const check = await validateShareLink(String(req.params.token), req);
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }
    const { link, item } = check;
    await logAccess({ itemId: item.id, shareLinkId: link.id, action: "VIEW_META", req });

    res.json({
      itemId: item.id,
      itemType: item.itemType,
      encryptedMetadata: item.encryptedMetadata,
      metadataIv: item.metadataIv,
      fileIv: item.fileIv,
      sha256Checksum: item.sha256Checksum,
      sizeBytes: item.sizeBytes,
      expiresAt: toUtcIso(link.expiresAt),
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

/** Download via public link. No account needed. */
blobRouter.post("/:token/download", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const check = await validateShareLink(String(req.params.token), req);
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }
    const { link, item } = check;

    if (link.passwordHash) {
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const valid = password ? await argon2.verify(link.passwordHash, password) : false;
      if (!valid) {
        await logAccess({ itemId: item.id, shareLinkId: link.id, action: "DENIED_PASSWORD", req });
        res.status(401).json({ error: "Incorrect link password" });
        return;
      }
    }

    if (item.itemType === "FILE" && !item.blobKey) {
      res.status(410).json({ error: "Encrypted file is no longer available" });
      return;
    }

    // Optimistic atomic increment: only succeeds if nobody else downloaded in between.
    const newCount = link.downloadCount + 1;
    const updated = unwrap(
      await db()
        .from("ShareLink")
        .update({ downloadCount: newCount })
        .eq("id", link.id)
        .eq("isRevoked", false)
        .eq("downloadCount", link.downloadCount)
        .select("id")
        .maybeSingle()
    );
    if (!updated) {
      res.status(409).json({ error: "Concurrent access, please retry" });
      return;
    }

    const payload = item.itemType === "SECRET_NOTE" ? item.encryptedPayload : null;
    const fileBuffer = item.itemType === "FILE" ? await readBlobBuffer(item.blobKey) : null;

    await logAccess({ itemId: item.id, shareLinkId: link.id, action: "DOWNLOAD_SUCCESS", req });

    // Burn only THIS link; the file and every other share remain available.
    const exhausted = link.maxDownloads !== null && newCount >= link.maxDownloads;
    if (link.burnAfterReading || exhausted) {
      unwrap(await db().from("ShareLink").update({ isRevoked: true }).eq("id", link.id));
      await logAccess({ itemId: item.id, shareLinkId: link.id, action: "BURNED", req });
    }

    if (item.itemType === "SECRET_NOTE") {
      res.json({
        itemType: "SECRET_NOTE",
        encryptedPayload: payload,
        fileIv: item.fileIv,
        encryptedMetadata: item.encryptedMetadata,
        metadataIv: item.metadataIv,
        sha256Checksum: item.sha256Checksum,
      });
      return;
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-VaultX-File-IV", item.fileIv);
    res.setHeader("X-VaultX-SHA256", item.sha256Checksum);
    res.send(fileBuffer);
  } catch (err) {
    next(err);
  }
});

/** Download as a specific registered recipient (login required). */
blobRouter.post(
  "/recipient/:itemId/download",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = String(req.params.itemId);
      const userId = req.user!.userId;

      const key = unwrap(
        await db()
          .from("RecipientKey")
          .select("*")
          .eq("itemId", itemId)
          .eq("recipientId", userId)
          .maybeSingle()
      ) as Row | null;
      const item = key
        ? ((unwrap(await db().from("VaultItem").select("*").eq("id", itemId).maybeSingle()) as Row | null))
        : null;

      if (!key || !item || key.isRevoked || item.isRevoked) {
        res.status(404).json({ error: "Shared item not found or revoked" });
        return;
      }
      if (parseUtcDate(item.expiresAt) <= new Date()) {
        await logAccess({ itemId, accessorUserId: userId, action: "DENIED_EXPIRED", req });
        res.status(410).json({ error: "Item has expired" });
        return;
      }
      if (key.maxDownloads !== null && key.downloadCount >= key.maxDownloads) {
        await logAccess({ itemId, accessorUserId: userId, action: "DENIED_LIMIT", req });
        res.status(410).json({ error: "Download limit reached" });
        return;
      }
      if (item.itemType === "FILE" && !item.blobKey) {
        res.status(410).json({ error: "Encrypted file is no longer available" });
        return;
      }

      const newCount = key.downloadCount + 1;
      const updated = unwrap(
        await db()
          .from("RecipientKey")
          .update({ downloadCount: newCount })
          .eq("id", key.id)
          .eq("isRevoked", false)
          .eq("downloadCount", key.downloadCount)
          .select("id")
          .maybeSingle()
      );
      if (!updated) {
        res.status(409).json({ error: "Concurrent access, please retry" });
        return;
      }

      const fileBuffer = item.itemType === "FILE" ? await readBlobBuffer(item.blobKey) : null;
      await logAccess({ itemId, accessorUserId: userId, action: "DOWNLOAD_SUCCESS", req });

      // Burn only THIS recipient's share.
      const exhausted = key.maxDownloads !== null && newCount >= key.maxDownloads;
      if (key.burnAfterReading || exhausted) {
        unwrap(await db().from("RecipientKey").update({ isRevoked: true }).eq("id", key.id));
        await logAccess({ itemId, accessorUserId: userId, action: "BURNED", req });
      }

      if (item.itemType === "SECRET_NOTE") {
        res.json({
          itemType: "SECRET_NOTE",
          wrappedAesKey: key.wrappedAesKey,
          encryptedPayload: item.encryptedPayload,
          fileIv: item.fileIv,
          encryptedMetadata: item.encryptedMetadata,
          metadataIv: item.metadataIv,
          sha256Checksum: item.sha256Checksum,
        });
        return;
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("X-VaultX-Wrapped-Key", key.wrappedAesKey);
      res.setHeader("X-VaultX-File-IV", item.fileIv);
      res.setHeader("X-VaultX-SHA256", item.sha256Checksum);
      res.send(fileBuffer);
    } catch (err) {
      next(err);
    }
  }
);
