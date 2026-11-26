import crypto from "crypto";
import fsp from "fs/promises";
import path from "path";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { blobExists, deleteBlob, generateBlobKey } from "../services/storage.service";

export const webCompatRouter = Router();

function hashClientIp(req: Request): string {
  const raw =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

const registerUserSchema = z.object({
  username: z.string().min(1).max(64),
  publicKeyPem: z.string().min(10),
  fingerprint: z.string().optional(),
});

/**
 * POST /api/users/register
 * Registers a Mode A username + RSA-OAEP public key PEM + fingerprint.
 */
webCompatRouter.post(
  "/users/register",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = registerUserSchema.parse(req.body);
      const existing = await prisma.user.findUnique({ where: { username: data.username } });
      if (existing) {
        res.status(409).json({ success: false, message: "Username is already registered" });
        return;
      }

      const user = await prisma.user.create({
        data: {
          username: data.username,
          displayName: data.username,
          publicKey: data.publicKeyPem,
          publicKeyFingerprint: data.fingerprint || "00:00:00",
        },
        select: {
          username: true,
          publicKeyFingerprint: true,
        },
      });

      res.status(201).json({
        success: true,
        user: {
          username: user.username,
          fingerprint: user.publicKeyFingerprint,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/users/:username/pubkey
 * Looks up a recipient's RSA-OAEP public key PEM & fingerprint for Mode A sharing.
 */
webCompatRouter.get(
  "/users/:username/pubkey",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const username = String(req.params.username);
      const user = await prisma.user.findUnique({
        where: { username },
        select: {
          username: true,
          publicKey: true,
          publicKeyFingerprint: true,
        },
      });

      if (!user) {
        res.status(404).json({ success: false, message: `User '${username}' not found` });
        return;
      }

      res.json({
        success: true,
        username: user.username,
        publicKeyPem: user.publicKey,
        fingerprint: user.publicKeyFingerprint,
      });
    } catch (err) {
      next(err);
    }
  }
);

const webUploadSchema = z.object({
  encryptedBlobB64: z.string().min(1),
  ivB64: z.string().min(1),
  metaIvB64: z.string().optional(),
  encryptedMetaB64: z.string().min(1),
  wrappedAesKeyB64: z.string().nullable().optional(),
  mode: z.enum(["MODE_A", "MODE_B"]).default("MODE_B"),
  isPasswordProtected: z.boolean().default(false),
  isBurnAfterReading: z.boolean().default(false),
  expiryMinutes: z.coerce.number().int().min(1).max(10080).default(60),
  maxDownloads: z.coerce.number().int().min(1).max(1000).default(5),
  recipientUsername: z.string().nullable().optional(),
});

/**
 * POST /api/vault/upload
 * Stores encrypted ciphertext blob on disk and metadata in Supabase PostgreSQL.
 */
webCompatRouter.post(
  "/vault/upload",
  async (req: Request, res: Response, next: NextFunction) => {
    let blobKey: string | null = null;
    try {
      const data = webUploadSchema.parse(req.body);
      const cipherBuffer = Buffer.from(data.encryptedBlobB64, "base64");
      const sha256Checksum = crypto.createHash("sha256").update(cipherBuffer).digest("hex");

      blobKey = generateBlobKey();
      const fullPath = path.resolve(env.BLOB_STORAGE_PATH, blobKey);
      await fsp.writeFile(fullPath, cipherBuffer);

      const ownerToken = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + data.expiryMinutes * 60 * 1000);
      const effectiveMax = data.isBurnAfterReading ? 1 : data.maxDownloads;

      const item = await prisma.vaultItem.create({
        data: {
          ownerToken,
          mode: data.mode,
          recipientUsername: data.recipientUsername ?? null,
          wrappedAesKeyB64: data.wrappedAesKeyB64 ?? null,
          itemType: "FILE",
          blobKey,
          encryptedMetadata: data.encryptedMetaB64,
          metadataIv: data.metaIvB64 || data.ivB64,
          fileIv: data.ivB64,
          sha256Checksum,
          sizeBytes: cipherBuffer.byteLength,
          isPasswordProtected: data.isPasswordProtected,
          isBurnAfterReading: data.isBurnAfterReading,
          maxDownloads: effectiveMax,
          remainingDownloads: effectiveMax,
          expiresAt,
        },
      });

      await prisma.accessLog.create({
        data: {
          itemId: item.id,
          action: "CREATED",
          ipHash: hashClientIp(req),
        },
      });

      res.status(201).json({
        success: true,
        fileId: item.id,
        ownerToken,
        downloadUrl: `/v/${item.id}`,
        expiresAt: item.expiresAt.toISOString(),
      });
    } catch (err) {
      if (blobKey) {
        await deleteBlob(blobKey).catch(() => {});
      }
      next(err);
    }
  }
);

/**
 * GET /api/vault/:id/meta
 * Returns encrypted metadata headers without consuming a download.
 */
webCompatRouter.get(
  "/vault/:id/meta",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const vault = await prisma.vaultItem.findUnique({ where: { id } });

      if (!vault) {
        res.status(404).json({ success: false, message: `Vault '${id}' not found` });
        return;
      }
      if (vault.isRevoked) {
        res.status(410).json({ success: false, message: "Vault has been revoked by owner" });
        return;
      }
      if (vault.burned || vault.remainingDownloads <= 0) {
        res
          .status(410)
          .json({ success: false, message: "Vault has been burned or exceeded download limit" });
        return;
      }
      if (vault.expiresAt <= new Date()) {
        res.status(410).json({ success: false, message: "Vault has expired" });
        return;
      }

      res.json({
        success: true,
        id: vault.id,
        mode: vault.mode,
        recipientUsername: vault.recipientUsername,
        encryptedMetaB64: vault.encryptedMetadata,
        ivB64: vault.fileIv,
        metaIvB64: vault.metadataIv,
        wrappedAesKeyB64: vault.wrappedAesKeyB64,
        isPasswordProtected: vault.isPasswordProtected,
        isBurnAfterReading: vault.isBurnAfterReading,
        maxDownloads: vault.maxDownloads,
        remainingDownloads: vault.remainingDownloads,
        expiresAt: vault.expiresAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/vault/:id/download
 * Atomically decrements remainingDownloads, enforces burn-after-reading, and returns ciphertext.
 */
webCompatRouter.post(
  "/vault/:id/download",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const existing = await prisma.vaultItem.findUnique({ where: { id } });

      if (!existing) {
        res.status(404).json({ success: false, message: `Vault '${id}' not found` });
        return;
      }
      if (existing.isRevoked) {
        res.status(410).json({ success: false, message: "Vault has been revoked by owner" });
        return;
      }
      if (existing.burned || existing.remainingDownloads <= 0) {
        res
          .status(410)
          .json({ success: false, message: "Vault has been burned or exceeded download limit" });
        return;
      }
      if (existing.expiresAt <= new Date()) {
        res.status(410).json({ success: false, message: "Vault has expired" });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const resUpdate = await tx.vaultItem.updateMany({
          where: {
            id,
            isRevoked: false,
            burned: false,
            remainingDownloads: { gt: 0 },
          },
          data: {
            remainingDownloads: { decrement: 1 },
          },
        });
        if (resUpdate.count === 0) return null;
        return tx.vaultItem.findUnique({ where: { id } });
      });

      if (!updated) {
        res.status(410).json({ success: false, message: "Vault download limit reached" });
        return;
      }

      if (!updated.blobKey || !(await blobExists(updated.blobKey))) {
        res.status(404).json({ success: false, message: "Encrypted blob no longer exists" });
        return;
      }

      const fullPath = path.resolve(env.BLOB_STORAGE_PATH, updated.blobKey);
      const cipherBuffer = await fsp.readFile(fullPath);
      const encryptedBlobB64 = cipherBuffer.toString("base64");

      const ipHash = hashClientIp(req);
      await prisma.accessLog.create({
        data: { itemId: updated.id, action: "DOWNLOAD_SUCCESS", ipHash },
      });

      const shouldBurn = updated.isBurnAfterReading || updated.remainingDownloads <= 0;
      if (shouldBurn) {
        await deleteBlob(updated.blobKey).catch(() => {});
        await prisma.vaultItem.update({
          where: { id: updated.id },
          data: { burned: true },
        });
        await prisma.accessLog.create({
          data: { itemId: updated.id, action: "BURNED", ipHash: "system" },
        });
      }

      res.json({
        success: true,
        encryptedBlobB64,
        ivB64: updated.fileIv,
        metaIvB64: updated.metadataIv,
        remainingDownloads: updated.remainingDownloads,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/vault/:id/logs
 * Returns audit trail formatted for vaultx-web's AuditTrail component.
 */
webCompatRouter.get(
  "/vault/:id/logs",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const ownerToken = String(req.headers["x-owner-token"] || "");
      const vault = await prisma.vaultItem.findUnique({
        where: { id },
        include: {
          accessLogs: { orderBy: { createdAt: "asc" } },
        },
      });

      if (!vault) {
        res.status(404).json({ success: false, message: `Vault '${id}' not found` });
        return;
      }
      if (!ownerToken || vault.ownerToken !== ownerToken) {
        res.status(401).json({ success: false, message: "Unauthorized: invalid owner token" });
        return;
      }

      const eventMap: Record<string, string> = {
        CREATED: "CREATED",
        DOWNLOAD_SUCCESS: "DOWNLOAD",
        BURNED: "BURNED",
        REVOKED: "REVOKED",
      };

      res.json({
        success: true,
        logs: vault.accessLogs.map((l) => ({
          timestamp: l.createdAt.toISOString(),
          ipHash: l.ipHash || "system",
          event: eventMap[l.action] || l.action,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/vault/:id/revoke
 * Instant sender kill-switch: deletes encrypted blob from disk and marks vault revoked.
 */
webCompatRouter.post(
  "/vault/:id/revoke",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const ownerToken = String(req.headers["x-owner-token"] || "");
      const vault = await prisma.vaultItem.findUnique({ where: { id } });

      if (!vault) {
        res.status(404).json({ success: false, message: `Vault '${id}' not found` });
        return;
      }
      if (!ownerToken || vault.ownerToken !== ownerToken) {
        res.status(401).json({ success: false, message: "Unauthorized: invalid owner token" });
        return;
      }

      await deleteBlob(vault.blobKey);
      await prisma.vaultItem.update({
        where: { id: vault.id },
        data: { isRevoked: true, burned: true },
      });
      await prisma.accessLog.create({
        data: {
          itemId: vault.id,
          action: "REVOKED",
          ipHash: hashClientIp(req),
        },
      });

      res.json({ success: true, message: "Revoked" });
    } catch (err) {
      next(err);
    }
  }
);
