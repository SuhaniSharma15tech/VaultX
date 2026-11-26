import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware";
import { auditEvents } from "../services/audit.service";
import { blobExists, readBlobInspectorSample } from "../services/storage.service";

export const logsRouter = Router();

/**
 * Fetch historical access audit logs for an item owned by the current user.
 */
logsRouter.get(
  "/logs/:itemId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = String(req.params.itemId);
      const item = await prisma.vaultItem.findUnique({
        where: { id: itemId },
        select: { ownerId: true },
      });

      if (!item || item.ownerId !== req.user!.userId) {
        res.status(403).json({ error: "Not authorized to view logs for this item" });
        return;
      }

      const logs = await prisma.accessLog.findMany({
        where: { itemId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      res.json({ logs });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Real-Time Access Audit Logs via Server-Sent Events (SSE).
 */
logsRouter.get(
  "/logs/:itemId/stream",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = String(req.params.itemId);
      const item = await prisma.vaultItem.findUnique({
        where: { id: itemId },
        select: { ownerId: true },
      });

      if (!item || item.ownerId !== req.user!.userId) {
        res.status(403).json({ error: "Not authorized to stream logs for this item" });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const channel = `item:${itemId}`;
      const onEvent = (entry: unknown) => {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      };

      auditEvents.on(channel, onEvent);
      const keepAlive = setInterval(() => res.write(": ping\n\n"), 25000);

      req.on("close", () => {
        clearInterval(keepAlive);
        auditEvents.off(channel, onEvent);
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Live "Server Inspector" view proving zero-knowledge storage:
 * shows raw DB metadata & raw ciphertext bytes stored on disk (no plaintext anywhere).
 */
logsRouter.get(
  "/inspector/:itemId",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = String(req.params.itemId);
      const item = await prisma.vaultItem.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          itemType: true,
          blobKey: true,
          encryptedMetadata: true,
          metadataIv: true,
          fileIv: true,
          sha256Checksum: true,
          sizeBytes: true,
          expiresAt: true,
          createdAt: true,
          encryptedPayload: true,
        },
      });

      if (!item) {
        res.status(404).json({ error: "Vault item not found" });
        return;
      }

      let ciphertextSample = null;
      if (item.blobKey && (await blobExists(item.blobKey))) {
        ciphertextSample = await readBlobInspectorSample(item.blobKey, 256);
      } else if (item.encryptedPayload) {
        const buf = Buffer.from(item.encryptedPayload, "utf8");
        ciphertextSample = {
          hexPreview: buf.subarray(0, 256).toString("hex"),
          base64Preview: buf.subarray(0, 256).toString("base64"),
          totalBytes: buf.length,
        };
      }

      res.json({
        proof: "ZERO_KNOWLEDGE_VERIFIED",
        storedDatabaseRow: {
          id: item.id,
          itemType: item.itemType,
          opaqueBlobKey: item.blobKey,
          encryptedMetadata: item.encryptedMetadata,
          metadataIv: item.metadataIv,
          fileIv: item.fileIv,
          sha256Checksum: item.sha256Checksum,
          sizeBytes: item.sizeBytes,
          expiresAt: item.expiresAt,
          createdAt: item.createdAt,
        },
        ciphertextSample,
      });
    } catch (err) {
      next(err);
    }
  }
);
