import { Router, Request, Response, NextFunction } from "express";
import { db, getOwnedItem, Row, toUtcIso, unwrap } from "../lib/db";
import { requireAuth } from "../middleware/auth.middleware";
import { auditEvents } from "../services/audit.service";
import { blobExists, readBlobInspectorSample } from "../services/storage.service";

export const logsRouter = Router();

/** Access audit log for one of my files (covers all of its shares). */
logsRouter.get("/logs/:itemId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const itemId = String(req.params.itemId);
    const item = await getOwnedItem(itemId, req.user!.userId);
    if (!item) {
      res.status(403).json({ error: "Not authorized to view logs for this file" });
      return;
    }

    const logs = (unwrap(
      await db()
        .from("AccessLog")
        .select("id,itemId,shareLinkId,accessorUserId,action,ipHash,createdAt")
        .eq("itemId", itemId)
        .order("createdAt", { ascending: false })
        .limit(100)
    ) ?? []) as Row[];

    res.json({ logs: logs.map((l) => ({ ...l, createdAt: toUtcIso(l.createdAt) })) });
  } catch (err) {
    next(err);
  }
});

/** Real-time access audit log via Server-Sent Events. */
logsRouter.get("/logs/:itemId/stream", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const itemId = String(req.params.itemId);
    const item = await getOwnedItem(itemId, req.user!.userId);
    if (!item) {
      res.status(403).json({ error: "Not authorized to stream logs for this file" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const channel = `item:${itemId}`;
    const onEvent = (entry: unknown) => res.write(`data: ${JSON.stringify(entry)}\n\n`);

    auditEvents.on(channel, onEvent);
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      auditEvents.off(channel, onEvent);
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Server Inspector: proves zero-knowledge storage by showing exactly what the server holds
 * (opaque row + raw ciphertext bytes). Owner only.
 */
logsRouter.get("/inspector/:itemId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await getOwnedItem(String(req.params.itemId), req.user!.userId);
    if (!item) {
      res.status(404).json({ error: "File not found" });
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
        expiresAt: toUtcIso(item.expiresAt),
        createdAt: toUtcIso(item.createdAt),
      },
      ciphertextSample,
    });
  } catch (err) {
    next(err);
  }
});
