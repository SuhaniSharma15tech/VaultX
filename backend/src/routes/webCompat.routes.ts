import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware";
import { getSupabaseClient } from "../lib/supabase";
import {
  blobExists,
  deleteBlob,
  generateBlobKey,
  readBlobBuffer,
  saveBlobBuffer,
} from "../services/storage.service";

export const webCompatRouter = Router();

/**
 * Prisma creates `TIMESTAMP(3)` (without time zone) columns in PostgreSQL.
 * PostgREST returns them without a trailing `Z`, which JS `new Date()` would
 * otherwise interpret in local timezone (e.g. IST) instead of UTC.
 */
function parseUtcDate(val: string): Date {
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(val);
  return new Date(hasTz ? val : `${val}Z`);
}

function toUtcIso(val: string): string {
  return parseUtcDate(val).toISOString();
}

function hashClientIp(req: Request): string {
  const raw =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/**
 * Enforces vault ownership on protected sender actions (logs, revoke).
 * Returns null if authorized, or { status, message } if denied.
 */
function verifyVaultOwnership(
  req: Request,
  vault: { ownerId?: string | null; ownerToken?: string | null },
  ownerToken: string
): { status: number; message: string } | null {
  if (vault.ownerId) {
    if (!req.user) {
      return { status: 401, message: "Authentication required" };
    }
    if (vault.ownerId !== req.user.userId) {
      return { status: 403, message: "Forbidden: you do not own this vault" };
    }
  } else if (!ownerToken || vault.ownerToken !== ownerToken) {
    return { status: 401, message: "Unauthorized: invalid owner token" };
  }
  if (ownerToken && vault.ownerToken && vault.ownerToken !== ownerToken) {
    return { status: 401, message: "Unauthorized: invalid owner token" };
  }
  return null;
}

/**
 * Deletes a blob from disk only if no other active (non-revoked, non-burned)
 * VaultItem still references the same blobKey.
 */
async function safeDeleteBlobIfUnreferenced(
  supabase: ReturnType<typeof getSupabaseClient>,
  blobKey: string | null | undefined,
  excludeItemId: string
): Promise<void> {
  if (!blobKey) return;
  const { count } = await supabase
    .from("VaultItem")
    .select("id", { count: "exact", head: true })
    .eq("blobKey", blobKey)
    .neq("id", excludeItemId)
    .eq("isRevoked", false)
    .eq("burned", false);
  if ((count ?? 0) === 0) {
    await deleteBlob(blobKey).catch(() => {});
  }
}

const registerUserSchema = z.object({
  username: z.string().min(1).max(64),
  publicKeyPem: z.string().min(10),
  fingerprint: z.string().optional(),
});

/**
 * POST /api/users/register
 * Registers a Mode A username + RSA-OAEP public key PEM + fingerprint over Supabase HTTPS.
 */
webCompatRouter.post(
  "/users/register",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = registerUserSchema.parse(req.body);
      const supabase = getSupabaseClient();

      const { data: existing, error: findErr } = await supabase
        .from("User")
        .select("id")
        .eq("username", data.username)
        .maybeSingle();

      if (findErr) throw new Error(findErr.message);
      if (existing) {
        res.status(409).json({ success: false, message: "Username is already registered" });
        return;
      }

      const now = new Date().toISOString();
      const { data: user, error: insertErr } = await supabase
        .from("User")
        .insert({
          id: crypto.randomUUID(),
          username: data.username,
          displayName: data.username,
          publicKey: data.publicKeyPem,
          publicKeyFingerprint: data.fingerprint || "00:00:00",
          createdAt: now,
          updatedAt: now,
        })
        .select("username, publicKeyFingerprint")
        .single();

      if (insertErr) throw new Error(insertErr.message);

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
      const supabase = getSupabaseClient();

      const { data: user, error } = await supabase
        .from("User")
        .select("username, publicKey, publicKeyFingerprint")
        .eq("username", username)
        .maybeSingle();

      if (error) throw new Error(error.message);
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

const webRegisterSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(128),
  username: z.string().min(3).max(64).optional(),
  publicKeyPem: z.string().min(10).optional(),
  fingerprint: z.string().min(8).optional(),
});

const webLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/web-auth/register
 * Registers a user in Supabase over HTTPS and returns a signed JWT.
 */
webCompatRouter.post(
  "/web-auth/register",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = webRegisterSchema.parse(req.body);
      const email = data.email.trim().toLowerCase();
      const supabase = getSupabaseClient();

      const { data: existing, error: findErr } = await supabase
        .from("User")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (findErr) throw new Error(findErr.message);
      if (existing) {
        res.status(409).json({
          success: false,
          code: "EMAIL_EXISTS",
          message: "An account with this email already exists.",
        });
        return;
      }

      const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const baseHandle =
        (data.username || data.name || email.split("@")[0])
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "")
          .slice(0, 16) || "user";
      const assignedUsername = data.username || `${baseHandle}_${crypto.randomBytes(3).toString("hex")}`;

      const { data: user, error: insertErr } = await supabase
        .from("User")
        .insert({
          id,
          username: assignedUsername,
          email,
          displayName: data.name.trim(),
          passwordHash,
          publicKey: data.publicKeyPem || "PENDING_KEY_SETUP",
          publicKeyFingerprint: data.fingerprint || crypto.randomBytes(16).toString("hex"),
          createdAt: now,
          updatedAt: now,
        })
        .select("id, username, email, displayName, publicKey, publicKeyFingerprint")
        .single();

      if (insertErr) throw new Error(insertErr.message);

      const token = jwt.sign(
        { userId: user.id, email: user.email ?? email },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
      );

      res.status(201).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.displayName || email.split("@")[0],
          publicKeyPem: user.publicKey,
          fingerprint: user.publicKeyFingerprint,
        },
        token,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/web-auth/login
 * Authenticates a user in Supabase over HTTPS. Returns 404 USER_NOT_FOUND if account doesn't exist.
 */
webCompatRouter.post(
  "/web-auth/login",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = webLoginSchema.parse(req.body);
      const email = data.email.trim().toLowerCase();
      const supabase = getSupabaseClient();

      const { data: user, error } = await supabase
        .from("User")
        .select("id, username, email, displayName, publicKey, publicKeyFingerprint, passwordHash")
        .eq("email", email)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!user) {
        res.status(404).json({
          success: false,
          code: "USER_NOT_FOUND",
          message: "No account found for this email.",
        });
        return;
      }

      if (!user.passwordHash || !(await argon2.verify(user.passwordHash, data.password))) {
        res.status(401).json({
          success: false,
          code: "INVALID_PASSWORD",
          message: "Invalid password.",
        });
        return;
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email ?? email },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
      );

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.displayName || email.split("@")[0],
          publicKeyPem: user.publicKey,
          fingerprint: user.publicKeyFingerprint,
        },
        token,
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
 * Stores encrypted ciphertext blob on disk and metadata in Supabase PostgreSQL over HTTPS (port 443).
 */
webCompatRouter.post(
  "/vault/upload",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    let blobKey: string | null = null;
    try {
      const data = webUploadSchema.parse(req.body);
      const supabase = getSupabaseClient();

      const cipherBuffer = Buffer.from(data.encryptedBlobB64, "base64");
      const sha256Checksum = crypto.createHash("sha256").update(cipherBuffer).digest("hex");

      blobKey = generateBlobKey();
      await saveBlobBuffer(blobKey, cipherBuffer);

      const itemId = crypto.randomUUID();
      const ownerToken = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + data.expiryMinutes * 60 * 1000).toISOString();
      const effectiveMax = data.isBurnAfterReading ? 1 : data.maxDownloads;

      const { data: item, error: insertErr } = await supabase
        .from("VaultItem")
        .insert({
          id: itemId,
          ownerId: req.user?.userId ?? null,
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
          burned: false,
          isRevoked: false,
          expiresAt,
          createdAt: new Date().toISOString(),
        })
        .select("id, expiresAt")
        .single();

      if (insertErr) throw new Error(insertErr.message);

      await supabase.from("AccessLog").insert({
        id: crypto.randomUUID(),
        itemId: item.id,
        action: "CREATED",
        ipHash: hashClientIp(req),
        createdAt: new Date().toISOString(),
      });

      res.status(201).json({
        success: true,
        fileId: item.id,
        ownerToken,
        downloadUrl: `/v/${item.id}`,
        expiresAt: toUtcIso(item.expiresAt),
      });
    } catch (err) {
      if (blobKey) {
        await deleteBlob(blobKey).catch(() => {});
      }
      next(err);
    }
  }
);

const createShareSchema = z.object({
  mode: z.enum(["MODE_A", "MODE_B"]).default("MODE_B"),
  wrappedAesKeyB64: z.string().nullable().optional(),
  isPasswordProtected: z.boolean().default(false),
  isBurnAfterReading: z.boolean().default(false),
  expiryMinutes: z.coerce.number().int().min(1).max(10080).default(60),
  maxDownloads: z.coerce.number().int().min(1).max(1000).default(5),
  recipientUsername: z.string().nullable().optional(),
});

/**
 * POST /api/vault/:id/share
 * Creates a new shareable vault entry reusing an already-uploaded encrypted blob
 * without re-uploading the file. Enforces owner authorization.
 */
webCompatRouter.post(
  "/vault/:id/share",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sourceId = String(req.params.id);
      const ownerTokenHeader = String(req.headers["x-owner-token"] || "");
      const data = createShareSchema.parse(req.body);
      const supabase = getSupabaseClient();

      const { data: source, error: fetchErr } = await supabase
        .from("VaultItem")
        .select("*")
        .eq("id", sourceId)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);
      if (!source) {
        res.status(404).json({ success: false, message: `Vault '${sourceId}' not found` });
        return;
      }

      const authErr = verifyVaultOwnership(req, source, ownerTokenHeader);
      if (authErr) {
        res.status(authErr.status).json({ success: false, message: authErr.message });
        return;
      }

      if (source.isRevoked) {
        res.status(410).json({ success: false, message: "Source file has been revoked" });
        return;
      }

      if (!source.blobKey || !(await blobExists(source.blobKey))) {
        res.status(404).json({ success: false, message: "Encrypted blob no longer exists" });
        return;
      }

      const shareId = crypto.randomUUID();
      const newOwnerToken = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + data.expiryMinutes * 60 * 1000).toISOString();
      const effectiveMax = data.isBurnAfterReading ? 1 : data.maxDownloads;

      const { data: created, error: insertErr } = await supabase
        .from("VaultItem")
        .insert({
          id: shareId,
          ownerId: source.ownerId ?? req.user?.userId ?? null,
          ownerToken: newOwnerToken,
          mode: data.mode,
          recipientUsername: data.recipientUsername ?? null,
          wrappedAesKeyB64: data.wrappedAesKeyB64 ?? null,
          itemType: source.itemType || "FILE",
          blobKey: source.blobKey,
          encryptedMetadata: source.encryptedMetadata,
          metadataIv: source.metadataIv,
          fileIv: source.fileIv,
          sha256Checksum: source.sha256Checksum,
          sizeBytes: source.sizeBytes,
          isPasswordProtected: data.isPasswordProtected,
          isBurnAfterReading: data.isBurnAfterReading,
          maxDownloads: effectiveMax,
          remainingDownloads: effectiveMax,
          burned: false,
          isRevoked: false,
          expiresAt,
          createdAt: new Date().toISOString(),
        })
        .select("id, expiresAt")
        .single();

      if (insertErr) throw new Error(insertErr.message);

      await supabase.from("AccessLog").insert({
        id: crypto.randomUUID(),
        itemId: created.id,
        action: "CREATED",
        ipHash: hashClientIp(req),
        createdAt: new Date().toISOString(),
      });

      res.status(201).json({
        success: true,
        fileId: created.id,
        ownerToken: newOwnerToken,
        downloadUrl: `/v/${created.id}`,
        expiresAt: toUtcIso(created.expiresAt),
      });
    } catch (err) {
      next(err);
    }
  }
);

const updateSettingsSchema = z.object({
  mode: z.enum(["MODE_A", "MODE_B"]).optional(),
  recipientUsername: z.string().nullable().optional(),
  isPasswordProtected: z.boolean().optional(),
  isBurnAfterReading: z.boolean().optional(),
  expiryMinutes: z.coerce.number().int().min(1).max(10080).optional(),
  maxDownloads: z.coerce.number().int().min(1).max(1000).optional(),
});

/**
 * PATCH /api/vault/:id/settings
 * Updates sharing settings strictly for the specified vault ID (owner-only).
 */
webCompatRouter.patch(
  "/vault/:id/settings",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const ownerToken = String(req.headers["x-owner-token"] || "");
      const data = updateSettingsSchema.parse(req.body);
      const supabase = getSupabaseClient();

      const { data: vault, error: fetchErr } = await supabase
        .from("VaultItem")
        .select("id, ownerId, ownerToken, isRevoked")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);
      if (!vault) {
        res.status(404).json({ success: false, message: `Vault '${id}' not found` });
        return;
      }

      const authErr = verifyVaultOwnership(req, vault, ownerToken);
      if (authErr) {
        res.status(authErr.status).json({ success: false, message: authErr.message });
        return;
      }
      if (vault.isRevoked) {
        res.status(410).json({ success: false, message: "Vault has been revoked" });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (data.mode !== undefined) updates.mode = data.mode;
      if (data.recipientUsername !== undefined) updates.recipientUsername = data.recipientUsername;
      if (data.isPasswordProtected !== undefined) updates.isPasswordProtected = data.isPasswordProtected;
      if (data.isBurnAfterReading !== undefined) updates.isBurnAfterReading = data.isBurnAfterReading;
      if (data.maxDownloads !== undefined) {
        const effectiveMax = data.isBurnAfterReading ? 1 : data.maxDownloads;
        updates.maxDownloads = effectiveMax;
        updates.remainingDownloads = effectiveMax;
      }
      if (data.expiryMinutes !== undefined) {
        updates.expiresAt = new Date(Date.now() + data.expiryMinutes * 60 * 1000).toISOString();
      }

      const { data: updated, error: updateErr } = await supabase
        .from("VaultItem")
        .update(updates)
        .eq("id", id)
        .select("id, mode, recipientUsername, isPasswordProtected, isBurnAfterReading, maxDownloads, expiresAt")
        .single();

      if (updateErr) throw new Error(updateErr.message);

      res.json({
        success: true,
        vault: {
          ...updated,
          expiresAt: toUtcIso(updated.expiresAt),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/vault/mine
 * Returns only vault items owned by the currently authenticated user.
 */
webCompatRouter.get(
  "/vault/mine",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const supabase = getSupabaseClient();
      const { data: items, error } = await supabase
        .from("VaultItem")
        .select(
          "id, ownerId, ownerToken, mode, itemType, sizeBytes, isPasswordProtected, isBurnAfterReading, maxDownloads, remainingDownloads, burned, isRevoked, expiresAt, createdAt"
        )
        .eq("ownerId", req.user!.userId)
        .order("createdAt", { ascending: false });

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        vaults: (items ?? []).map((v) => ({
          id: v.id,
          fileId: v.id,
          ownerId: v.ownerId,
          ownerToken: v.ownerToken,
          mode: v.mode,
          itemType: v.itemType,
          sizeBytes: v.sizeBytes,
          isPasswordProtected: v.isPasswordProtected,
          isBurnAfterReading: v.isBurnAfterReading,
          maxDownloads: v.maxDownloads,
          remainingDownloads: v.remainingDownloads,
          burned: v.burned,
          revoked: v.isRevoked,
          expiresAt: toUtcIso(v.expiresAt),
          createdAt: toUtcIso(v.createdAt),
        })),
      });
    } catch (err) {
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
      const supabase = getSupabaseClient();

      const { data: vault, error } = await supabase
        .from("VaultItem")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw new Error(error.message);
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
      if (parseUtcDate(vault.expiresAt) <= new Date()) {
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
        expiresAt: toUtcIso(vault.expiresAt),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/vault/:id/download
 * Optimistically decrements remainingDownloads, enforces burn-after-reading, and returns ciphertext.
 */
webCompatRouter.post(
  "/vault/:id/download",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const supabase = getSupabaseClient();

      const { data: existing, error: fetchErr } = await supabase
        .from("VaultItem")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);
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
      if (parseUtcDate(existing.expiresAt) <= new Date()) {
        res.status(410).json({ success: false, message: "Vault has expired" });
        return;
      }

      const { data: updated, error: updateErr } = await supabase
        .from("VaultItem")
        .update({ remainingDownloads: existing.remainingDownloads - 1 })
        .eq("id", id)
        .eq("isRevoked", false)
        .eq("burned", false)
        .eq("remainingDownloads", existing.remainingDownloads)
        .gt("remainingDownloads", 0)
        .select("*")
        .maybeSingle();

      if (updateErr) throw new Error(updateErr.message);
      if (!updated) {
        res.status(410).json({ success: false, message: "Vault download limit reached" });
        return;
      }

      if (!updated.blobKey || !(await blobExists(updated.blobKey))) {
        res.status(404).json({ success: false, message: "Encrypted blob no longer exists" });
        return;
      }

      const cipherBuffer = await readBlobBuffer(updated.blobKey);
      const encryptedBlobB64 = cipherBuffer.toString("base64");

      const ipHash = hashClientIp(req);
      await supabase.from("AccessLog").insert({
        id: crypto.randomUUID(),
        itemId: updated.id,
        action: "DOWNLOAD_SUCCESS",
        ipHash,
        createdAt: new Date().toISOString(),
      });

      const shouldBurn = updated.isBurnAfterReading || updated.remainingDownloads <= 0;
      if (shouldBurn) {
        await safeDeleteBlobIfUnreferenced(supabase, updated.blobKey, updated.id);
        await supabase.from("VaultItem").update({ burned: true }).eq("id", updated.id);
        await supabase.from("AccessLog").insert({
          id: crypto.randomUUID(),
          itemId: updated.id,
          action: "BURNED",
          ipHash: "system",
          createdAt: new Date().toISOString(),
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
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const ownerToken = String(req.headers["x-owner-token"] || "");
      const supabase = getSupabaseClient();

      const { data: vault, error: vaultErr } = await supabase
        .from("VaultItem")
        .select("id, ownerId, ownerToken")
        .eq("id", id)
        .maybeSingle();

      if (vaultErr) throw new Error(vaultErr.message);
      if (!vault) {
        res.status(404).json({ success: false, message: `Vault '${id}' not found` });
        return;
      }
      const authErr = verifyVaultOwnership(req, vault, ownerToken);
      if (authErr) {
        res.status(authErr.status).json({ success: false, message: authErr.message });
        return;
      }

      const { data: logs, error: logsErr } = await supabase
        .from("AccessLog")
        .select("action, ipHash, createdAt")
        .eq("itemId", id)
        .order("createdAt", { ascending: true });

      if (logsErr) throw new Error(logsErr.message);

      const eventMap: Record<string, string> = {
        CREATED: "CREATED",
        DOWNLOAD_SUCCESS: "DOWNLOAD",
        BURNED: "BURNED",
        REVOKED: "REVOKED",
      };

      res.json({
        success: true,
        logs: (logs ?? []).map((l) => ({
          timestamp: toUtcIso(l.createdAt),
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
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const ownerToken = String(req.headers["x-owner-token"] || "");
      const supabase = getSupabaseClient();

      const { data: vault, error: vaultErr } = await supabase
        .from("VaultItem")
        .select("id, ownerId, ownerToken, blobKey")
        .eq("id", id)
        .maybeSingle();

      if (vaultErr) throw new Error(vaultErr.message);
      if (!vault) {
        res.status(404).json({ success: false, message: `Vault '${id}' not found` });
        return;
      }
      const authErr = verifyVaultOwnership(req, vault, ownerToken);
      if (authErr) {
        res.status(authErr.status).json({ success: false, message: authErr.message });
        return;
      }

      await safeDeleteBlobIfUnreferenced(supabase, vault.blobKey, vault.id);
      await supabase
        .from("VaultItem")
        .update({ isRevoked: true, burned: true })
        .eq("id", vault.id);

      await supabase.from("AccessLog").insert({
        id: crypto.randomUUID(),
        itemId: vault.id,
        action: "REVOKED",
        ipHash: hashClientIp(req),
        createdAt: new Date().toISOString(),
      });

      res.json({ success: true, message: "Revoked" });
    } catch (err) {
      next(err);
    }
  }
);
