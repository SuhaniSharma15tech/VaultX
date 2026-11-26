import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware";
import { deleteBlob, generateBlobKey } from "../services/storage.service";

export const vaultRouter = Router();

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.BLOB_STORAGE_PATH),
  filename: (_req, _file, cb) => cb(null, generateBlobKey()),
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES },
});

const uploadBodySchema = z.object({
  itemType: z.enum(["FILE", "SECRET_NOTE"]).default("FILE"),
  encryptedPayload: z.string().optional(),
  encryptedMetadata: z.string().min(1),
  metadataIv: z.string().min(1),
  fileIv: z.string().min(1),
  sha256Checksum: z.string().min(32),
  ttlMinutes: z.coerce.number().int().min(10).max(10080).default(1440), // 10 mins to 7 days
});

/**
 * Upload an encrypted file blob (multipart/form-data) or an encrypted secret note (JSON).
 */
vaultRouter.post(
  "/upload",
  optionalAuth,
  upload.single("blob"),
  async (req: Request, res: Response, next: NextFunction) => {
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

      const expiresAt = new Date(Date.now() + data.ttlMinutes * 60 * 1000);
      const sizeBytes = req.file
        ? req.file.size
        : Buffer.byteLength(data.encryptedPayload ?? "", "utf8");

      const item = await prisma.vaultItem.create({
        data: {
          ownerId: req.user?.userId ?? null,
          itemType: data.itemType,
          blobKey: req.file ? req.file.filename : null,
          encryptedPayload: data.itemType === "SECRET_NOTE" ? data.encryptedPayload : null,
          encryptedMetadata: data.encryptedMetadata,
          metadataIv: data.metadataIv,
          fileIv: data.fileIv,
          sha256Checksum: data.sha256Checksum,
          sizeBytes,
          expiresAt,
        },
        select: {
          id: true,
          itemType: true,
          sizeBytes: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      res.status(201).json({ item });
    } catch (err) {
      if (req.file) {
        await deleteBlob(req.file.filename).catch(() => {});
      }
      next(err);
    }
  }
);

/**
 * List vault items owned by or shared with the authenticated user.
 */
vaultRouter.get("/items", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();

    const [owned, sharedWithMe] = await Promise.all([
      prisma.vaultItem.findMany({
        where: { ownerId: userId, isRevoked: false, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          itemType: true,
          encryptedMetadata: true,
          metadataIv: true,
          sizeBytes: true,
          expiresAt: true,
          createdAt: true,
          shareLinks: {
            where: { isRevoked: false },
            select: {
              id: true,
              token: true,
              maxDownloads: true,
              downloadCount: true,
              burnAfterReading: true,
              expiresAt: true,
            },
          },
          recipientKeys: {
            where: { isRevoked: false },
            select: {
              id: true,
              recipient: { select: { id: true, email: true, displayName: true } },
              maxDownloads: true,
              downloadCount: true,
              burnAfterReading: true,
            },
          },
        },
      }),
      prisma.recipientKey.findMany({
        where: {
          recipientId: userId,
          isRevoked: false,
          item: { isRevoked: false, expiresAt: { gt: now } },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          wrappedAesKey: true,
          maxDownloads: true,
          downloadCount: true,
          burnAfterReading: true,
          item: {
            select: {
              id: true,
              itemType: true,
              encryptedMetadata: true,
              metadataIv: true,
              fileIv: true,
              sha256Checksum: true,
              sizeBytes: true,
              expiresAt: true,
              createdAt: true,
              owner: { select: { email: true, displayName: true } },
            },
          },
        },
      }),
    ]);

    res.json({ owned, sharedWithMe });
  } catch (err) {
    next(err);
  }
});

/**
 * Instant Sender Kill-Switch: revokes item, deletes encrypted blob from disk, and purges record.
 */
vaultRouter.delete(
  "/items/:itemId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = String(req.params.itemId);
      const item = await prisma.vaultItem.findUnique({
        where: { id: itemId },
        select: { id: true, ownerId: true, blobKey: true },
      });

      if (!item) {
        res.status(404).json({ error: "Vault item not found" });
        return;
      }

      if (item.ownerId !== req.user!.userId) {
        res.status(403).json({ error: "Only the owner can revoke this item" });
        return;
      }

      await deleteBlob(item.blobKey);
      await prisma.vaultItem.delete({ where: { id: item.id } });

      res.json({ revoked: true, itemId: item.id });
    } catch (err) {
      next(err);
    }
  }
);
