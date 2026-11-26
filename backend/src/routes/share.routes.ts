import crypto from "crypto";
import argon2 from "argon2";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, getOwnedItem, nowIso, parseUtcDate, Row, toUtcIso, unwrap, unwrapOne } from "../lib/db";
import { requireAuth } from "../middleware/auth.middleware";
import { logAccess } from "../services/audit.service";
import { loadSharesForItems } from "../services/shares.service";

export const shareRouter = Router();

const shareWithUserSchema = z
  .object({
    itemId: z.string().uuid(),
    recipientId: z.string().uuid().optional(),
    recipientEmail: z.string().email().optional(),
    wrappedAesKey: z.string().min(1),
    maxDownloads: z.number().int().min(1).max(1000).optional(),
    burnAfterReading: z.boolean().default(false),
  })
  .refine((d) => d.recipientId || d.recipientEmail, {
    message: "recipientId or recipientEmail is required",
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
 * EVENT 2a — Share a file with ONE specific registered user (public/private-key share).
 * Stores the file's AES key wrapped with that user's public key. One row per recipient.
 */
shareRouter.post("/user", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = shareWithUserSchema.parse(req.body);
    const item = await getOwnedItem(data.itemId, req.user!.userId);
    if (!item || item.isRevoked) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    let recipientId = data.recipientId;
    if (!recipientId) {
      const u = unwrap(
        await db().from("User").select("id").eq("email", data.recipientEmail!.toLowerCase()).maybeSingle()
      ) as Row | null;
      if (!u) {
        res.status(404).json({ error: "Recipient not found" });
        return;
      }
      recipientId = u.id as string;
    }

    const fields = {
      wrappedAesKey: data.wrappedAesKey,
      maxDownloads: data.burnAfterReading ? 1 : data.maxDownloads ?? null,
      burnAfterReading: data.burnAfterReading,
      downloadCount: 0,
      isRevoked: false,
    };

    const existing = unwrap(
      await db()
        .from("RecipientKey")
        .select("id")
        .eq("itemId", data.itemId)
        .eq("recipientId", recipientId)
        .maybeSingle()
    ) as Row | null;

    const recipientKey = existing
      ? unwrap(await db().from("RecipientKey").update(fields).eq("id", existing.id).select("id,itemId,recipientId,maxDownloads,burnAfterReading").single())
      : unwrap(
          await db()
            .from("RecipientKey")
            .insert({ id: crypto.randomUUID(), itemId: data.itemId, recipientId, createdAt: nowIso(), ...fields })
            .select("id,itemId,recipientId,maxDownloads,burnAfterReading")
            .single()
        );

    res.status(201).json({ recipientKey });
  } catch (err) {
    next(err);
  }
});

/**
 * EVENT 2b — Create a public share link (anyone with the link can open it, no account needed).
 * The AES key lives in the URL #fragment on the client and never reaches the server.
 * A file can have any number of links, each with its own limits.
 */
shareRouter.post("/link", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createShareLinkSchema.parse(req.body);
    const item = await getOwnedItem(data.itemId, req.user!.userId);
    if (!item || item.isRevoked) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const itemExpiry = parseUtcDate(item.expiresAt);
    const requested = data.ttlMinutes ? new Date(Date.now() + data.ttlMinutes * 60 * 1000) : itemExpiry;
    const expiresAt = requested < itemExpiry ? requested : itemExpiry;

    const passwordHash = data.password
      ? await argon2.hash(data.password, { type: argon2.argon2id })
      : null;

    const link = unwrapOne(
      await db()
        .from("ShareLink")
        .insert({
          id: crypto.randomUUID(),
          token: crypto.randomBytes(12).toString("base64url"),
          itemId: item.id,
          passwordHash,
          isPassphraseProtected: data.isPassphraseProtected,
          maxDownloads: data.burnAfterReading ? 1 : data.maxDownloads ?? null,
          burnAfterReading: data.burnAfterReading,
          expiresAt: expiresAt.toISOString(),
          createdAt: nowIso(),
        })
        .select("id,token,isPassphraseProtected,maxDownloads,burnAfterReading,expiresAt,createdAt")
        .single()
    );

    res.status(201).json({
      shareLink: {
        ...link,
        expiresAt: toUtcIso(link.expiresAt),
        createdAt: toUtcIso(link.createdAt),
        requiresPassword: Boolean(passwordHash),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** All shares (links + per-recipient) on one of my files. */
shareRouter.get("/item/:itemId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await getOwnedItem(String(req.params.itemId), req.user!.userId);
    if (!item) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const { links, recipients } = await loadSharesForItems([item.id]);
    res.json({ shareLinks: links, recipientShares: recipients });
  } catch (err) {
    next(err);
  }
});

/**
 * Revoke ONE public link. The file, other links and all recipient shares stay untouched.
 */
shareRouter.delete("/link/:linkId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const linkId = String(req.params.linkId);
    const link = unwrap(
      await db().from("ShareLink").select("id,itemId").eq("id", linkId).maybeSingle()
    ) as Row | null;
    const item = link ? await getOwnedItem(link.itemId, req.user!.userId) : null;
    if (!link || !item) {
      res.status(404).json({ error: "Share link not found" });
      return;
    }

    unwrap(await db().from("ShareLink").update({ isRevoked: true }).eq("id", link.id));
    await logAccess({ itemId: item.id, action: "REVOKED", shareLinkId: link.id, accessorUserId: req.user!.userId, req });

    res.json({ revoked: true, linkId: link.id });
  } catch (err) {
    next(err);
  }
});

/**
 * Revoke ONE recipient's share. Only that person loses access — the file, public links and
 * other recipients are unaffected.
 */
shareRouter.delete("/user/:recipientKeyId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keyId = String(req.params.recipientKeyId);
    const key = unwrap(
      await db().from("RecipientKey").select("id,itemId").eq("id", keyId).maybeSingle()
    ) as Row | null;
    const item = key ? await getOwnedItem(key.itemId, req.user!.userId) : null;
    if (!key || !item) {
      res.status(404).json({ error: "Recipient share not found" });
      return;
    }

    unwrap(await db().from("RecipientKey").update({ isRevoked: true }).eq("id", key.id));
    await logAccess({ itemId: item.id, action: "REVOKED", accessorUserId: req.user!.userId, req });

    res.json({ revoked: true, recipientKeyId: key.id });
  } catch (err) {
    next(err);
  }
});
