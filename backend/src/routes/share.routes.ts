import crypto from "crypto";
import argon2 from "argon2";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware";

export const shareRouter = Router();

const shareWithUserSchema = z.object({
  itemId: z.string().uuid(),
  recipientId: z.string().uuid(),
  wrappedAesKey: z.string().min(1),
  maxDownloads: z.number().int().min(1).max(1000).optional(),
  burnAfterReading: z.boolean().default(false),
});

const createShareLinkSchema = z.object({
  itemId: z.string().uuid(),
  password: z.string().min(1).max(128).optional(),
  isPassphraseProtected: z.boolean().default(false),
  maxDownloads: z.number().int().min(1).max(1000).optional(),
  burnAfterReading: z.boolean().default(false),
  ttlMinutes: z.number().int().min(10).max(10080).optional(),
});

/**
 * Share an encrypted item with a registered user by storing their public-key-wrapped AES key.
 */
shareRouter.post(
  "/user",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = shareWithUserSchema.parse(req.body);
      const item = await prisma.vaultItem.findUnique({ where: { id: data.itemId } });
      if (!item || item.ownerId !== req.user!.userId) {
        res.status(403).json({ error: "Not authorized to share this item" });
        return;
      }

      const recipientKey = await prisma.recipientKey.upsert({
        where: {
          itemId_recipientId: {
            itemId: data.itemId,
            recipientId: data.recipientId,
          },
        },
        update: {
          wrappedAesKey: data.wrappedAesKey,
          maxDownloads: data.burnAfterReading ? 1 : data.maxDownloads ?? null,
          burnAfterReading: data.burnAfterReading,
          isRevoked: false,
        },
        create: {
          itemId: data.itemId,
          recipientId: data.recipientId,
          wrappedAesKey: data.wrappedAesKey,
          maxDownloads: data.burnAfterReading ? 1 : data.maxDownloads ?? null,
          burnAfterReading: data.burnAfterReading,
        },
      });

      res.status(201).json({ recipientKey });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Create a share link (AES key stays in the URL #fragment on the client, never sent to server).
 */
shareRouter.post(
  "/link",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createShareLinkSchema.parse(req.body);
      const item = await prisma.vaultItem.findUnique({ where: { id: data.itemId } });
      if (!item || item.isRevoked) {
        res.status(404).json({ error: "Vault item not found" });
        return;
      }

      if (item.ownerId && item.ownerId !== req.user?.userId) {
        res.status(403).json({ error: "Not authorized to create link for this item" });
        return;
      }

      const passwordHash = data.password
        ? await argon2.hash(data.password, { type: argon2.argon2id })
        : null;

      const requestedExpiry = data.ttlMinutes
        ? new Date(Date.now() + data.ttlMinutes * 60 * 1000)
        : item.expiresAt;
      const expiresAt = requestedExpiry < item.expiresAt ? requestedExpiry : item.expiresAt;

      const token = crypto.randomBytes(12).toString("base64url");

      const shareLink = await prisma.shareLink.create({
        data: {
          token,
          itemId: item.id,
          passwordHash,
          isPassphraseProtected: data.isPassphraseProtected,
          maxDownloads: data.burnAfterReading ? 1 : data.maxDownloads ?? null,
          burnAfterReading: data.burnAfterReading,
          expiresAt,
        },
        select: {
          id: true,
          token: true,
          isPassphraseProtected: true,
          maxDownloads: true,
          burnAfterReading: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      res.status(201).json({
        shareLink: {
          ...shareLink,
          requiresPassword: Boolean(passwordHash),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Revoke a specific share link.
 */
shareRouter.delete(
  "/link/:linkId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const linkId = String(req.params.linkId);
      const link = await prisma.shareLink.findUnique({
        where: { id: linkId },
        include: { item: { select: { ownerId: true } } },
      });

      if (!link || link.item.ownerId !== req.user!.userId) {
        res.status(404).json({ error: "Share link not found" });
        return;
      }

      await prisma.shareLink.update({
        where: { id: link.id },
        data: { isRevoked: true },
      });

      res.json({ revoked: true, linkId: link.id });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Revoke a specific registered recipient's wrapped AES key (without deleting the file).
 */
shareRouter.delete(
  "/user/:recipientKeyId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recipientKeyId = String(req.params.recipientKeyId);
      const recKey = await prisma.recipientKey.findUnique({
        where: { id: recipientKeyId },
        include: { item: { select: { ownerId: true } } },
      });

      if (!recKey || recKey.item.ownerId !== req.user!.userId) {
        res.status(404).json({ error: "Recipient share not found" });
        return;
      }

      await prisma.recipientKey.delete({ where: { id: recKey.id } });
      res.json({ revoked: true, recipientKeyId: recKey.id });
    } catch (err) {
      next(err);
    }
  }
);
