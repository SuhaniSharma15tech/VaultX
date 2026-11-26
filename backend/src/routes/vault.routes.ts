import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env";
import { db, getOwnedItem, nowIso, parseUtcDate, Row, toUtcIso, unwrap, unwrapOne } from "../lib/db";
import { requireAuth } from "../middleware/auth.middleware";
import { logAccess } from "../services/audit.service";
import {
  isLinkActive,
  isRecipientActive,
  loadSharesForItems,
} from "../services/shares.service";
import { deleteBlob, generateBlobKey, saveBlobBuffer } from "../services/storage.service";

export const vaultRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES },
});

const uploadBodySchema = z.object({
  itemType: z.enum(["FILE", "SECRET_NOTE"]).default("FILE"),
  encryptedPayload: z.string().optional(),
  encryptedMetadata: z.string().min(1),
  metadataIv: z.string().min(1),
  fileIv: z.string().min(1),
  sha256Checksum: z.string().min(32),
  ttlMinutes: z.coerce.number().int().min(10).max(10080).default(1440),
});

const ITEM_FIELDS =
  "id,itemType,encryptedMetadata,metadataIv,fileIv,sha256Checksum,sizeBytes,expiresAt,createdAt,isRevoked";

/**
 * EVENT 1 — Upload. Login required. This only stores the encrypted file;
 * it creates NO share. Sharing is a separate step (POST /api/share/link, /api/share/user).
 */
vaultRouter.post(
  "/upload",
  requireAuth,
  upload.single("blob"),
  async (req: Request, res: Response, next: NextFunction) => {
    let blobKey: string | null = null;
    try {
      const data = uploadBodySchema.parse(req.body);

      if (data.itemType === "FILE" && !req.file) {
        res.status(400).json({ error: "Encrypted file blob is required for FILE uploads" });
        return;
      }
      if (data.itemType === "SECRET_NOTE" && !data.encryptedPayload) {
        res.status(400).json({ error: "encryptedPayload is required for SECRET_NOTE" });
        return;
      }

      if (data.itemType === "FILE" && req.file) {
        blobKey = generateBlobKey();
        await saveBlobBuffer(blobKey, req.file.buffer);
      }

      const sizeBytes = req.file
        ? req.file.size
        : Buffer.byteLength(data.encryptedPayload ?? "", "utf8");

      const item = unwrapOne(
        await db()
          .from("VaultItem")
          .insert({
            id: crypto.randomUUID(),
            ownerId: req.user!.userId,
            itemType: data.itemType,
            blobKey,
            encryptedPayload: data.itemType === "SECRET_NOTE" ? data.encryptedPayload : null,
            encryptedMetadata: data.encryptedMetadata,
            metadataIv: data.metadataIv,
            fileIv: data.fileIv,
            sha256Checksum: data.sha256Checksum,
            sizeBytes,
            expiresAt: new Date(Date.now() + data.ttlMinutes * 60 * 1000).toISOString(),
            createdAt: nowIso(),
          })
          .select("id,itemType,sizeBytes,expiresAt,createdAt")
          .single()
      );

      await logAccess({ itemId: item.id, action: "CREATED", accessorUserId: req.user!.userId, req });

      res.status(201).json({
        item: { ...item, expiresAt: toUtcIso(item.expiresAt), createdAt: toUtcIso(item.createdAt) },
      });
    } catch (err) {
      if (blobKey) await deleteBlob(blobKey).catch(() => {});
      next(err);
    }
  }
);

/**
 * "My files" page: files I own (each with all of its shares) and files shared with me.
 */
vaultRouter.get("/items", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();

    const ownedRows = (unwrap(
      await db()
        .from("VaultItem")
        .select(ITEM_FIELDS)
        .eq("ownerId", userId)
        .eq("isRevoked", false)
        .order("createdAt", { ascending: false })
    ) ?? []) as Row[];

    const owned = ownedRows.filter((i) => parseUtcDate(i.expiresAt) > now);
    const { links, recipients } = await loadSharesForItems(owned.map((i) => i.id));

    const ownedView = owned.map((i) => ({
      ...i,
      expiresAt: toUtcIso(i.expiresAt),
      createdAt: toUtcIso(i.createdAt),
      shareLinks: links.filter((l) => l.itemId === i.id),
      recipientShares: recipients.filter((r) => r.itemId === i.id),
    }));

    const myKeys = (unwrap(
      await db()
        .from("RecipientKey")
        .select("id,itemId,wrappedAesKey,maxDownloads,downloadCount,burnAfterReading")
        .eq("recipientId", userId)
        .eq("isRevoked", false)
        .order("createdAt", { ascending: false })
    ) ?? []) as Row[];

    let sharedWithMe: Row[] = [];
    if (myKeys.length > 0) {
      const sharedItems = (unwrap(
        await db()
          .from("VaultItem")
          .select(`${ITEM_FIELDS},ownerId`)
          .in("id", myKeys.map((k) => k.itemId))
      ) ?? []) as Row[];
      const ownerIds = Array.from(new Set(sharedItems.map((i) => i.ownerId).filter(Boolean)));
      const owners = ownerIds.length
        ? ((unwrap(
            await db().from("User").select("id,email,displayName").in("id", ownerIds)
          ) ?? []) as Row[])
        : [];

      sharedWithMe = myKeys
        .map((k) => {
          const item = sharedItems.find((i) => i.id === k.itemId);
          if (!item || item.isRevoked || parseUtcDate(item.expiresAt) <= now) return null;
          if (
            !isRecipientActive({
              isRevoked: false,
              maxDownloads: k.maxDownloads,
              downloadCount: k.downloadCount,
            })
          )
            return null;
          const owner = owners.find((o) => o.id === item.ownerId);
          return {
            shareId: k.id,
            wrappedAesKey: k.wrappedAesKey,
            maxDownloads: k.maxDownloads,
            downloadCount: k.downloadCount,
            burnAfterReading: k.burnAfterReading,
            item: {
              id: item.id,
              itemType: item.itemType,
              encryptedMetadata: item.encryptedMetadata,
              metadataIv: item.metadataIv,
              fileIv: item.fileIv,
              sha256Checksum: item.sha256Checksum,
              sizeBytes: item.sizeBytes,
              expiresAt: toUtcIso(item.expiresAt),
              createdAt: toUtcIso(item.createdAt),
              owner: owner ? { email: owner.email, displayName: owner.displayName } : null,
            },
          };
        })
        .filter(Boolean) as Row[];
    }

    res.json({ owned: ownedView, sharedWithMe });
  } catch (err) {
    next(err);
  }
});

/**
 * Per-user dashboard stats for the redesigned dashboard.
 */
vaultRouter.get("/dashboard/stats", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();

    const allItems = (unwrap(
      await db().from("VaultItem").select("id,expiresAt,isRevoked").eq("ownerId", userId)
    ) ?? []) as Row[];
    const allIds = allItems.map((i) => i.id);
    const activeFiles = allItems.filter((i) => !i.isRevoked && parseUtcDate(i.expiresAt) > now);

    const { links, recipients } = await loadSharesForItems(allIds);
    const activeIds = new Set(activeFiles.map((i) => i.id));

    const activeLinks = links.filter((l) => activeIds.has(l.itemId) && isLinkActive(l));
    const activeRecipients = recipients.filter((r) => activeIds.has(r.itemId) && isRecipientActive(r));

    const totalDownloads =
      links.reduce((s, l) => s + (l.downloadCount ?? 0), 0) +
      recipients.reduce((s, r) => s + (r.downloadCount ?? 0), 0);

    const recent = allIds.length
      ? ((unwrap(
          await db()
            .from("AccessLog")
            .select("id,itemId,shareLinkId,action,ipHash,createdAt")
            .in("itemId", allIds)
            .order("createdAt", { ascending: false })
            .limit(20)
        ) ?? []) as Row[])
      : [];

    res.json({
      totalFiles: activeFiles.length,
      activeLinkShares: activeLinks.length,
      activeRecipientShares: activeRecipients.length,
      totalDownloads,
      recentActivity: recent.map((l) => ({ ...l, createdAt: toUtcIso(l.createdAt) })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Explicitly delete the FILE itself (blob + all its shares + logs).
 * Revoking a single share never calls this.
 */
vaultRouter.delete("/items/:itemId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await getOwnedItem(String(req.params.itemId), req.user!.userId);
    if (!item) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    await deleteBlob(item.blobKey);
    unwrap(await db().from("VaultItem").delete().eq("id", item.id));

    res.json({ deleted: true, itemId: item.id });
  } catch (err) {
    next(err);
  }
});
