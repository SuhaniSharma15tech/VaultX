import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { db, nowIso, unwrap, unwrapOne } from "../lib/db";
import { requireAuth } from "../middleware/auth.middleware";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(80).optional(),
  password: z.string().min(8).max(128),
  publicKey: z.string().min(10),
  publicKeyFingerprint: z.string().min(16),
  encryptedPrivateKey: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const PUBLIC_USER_FIELDS =
  "id,email,displayName,publicKey,publicKeyFingerprint,encryptedPrivateKey,createdAt";

function signToken(userId: string, email: string) {
  return jwt.sign({ userId, email }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Signup is only required for people who upload/share files.
 * People who receive a share link never need an account.
 */
authRouter.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const email = data.email.toLowerCase();

    const existing = unwrap(
      await db().from("User").select("id").eq("email", email).maybeSingle()
    );
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const now = nowIso();
    const user = unwrapOne(
      await db()
        .from("User")
        .insert({
          id: crypto.randomUUID(),
          email,
          displayName: data.displayName ?? null,
          passwordHash: await argon2.hash(data.password, { type: argon2.argon2id }),
          publicKey: data.publicKey,
          publicKeyFingerprint: data.publicKeyFingerprint,
          encryptedPrivateKey: data.encryptedPrivateKey ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .select(PUBLIC_USER_FIELDS)
        .single()
    );

    res.status(201).json({ user, token: signToken(user.id, user.email) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);
    const email = data.email.toLowerCase();

    const user = unwrap(
      await db().from("User").select(`${PUBLIC_USER_FIELDS},passwordHash`).eq("email", email).maybeSingle()
    );

    if (!user || !user.passwordHash || !(await argon2.verify(user.passwordHash, data.password))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...publicUser } = user;
    res.json({ user: publicUser, token: signToken(user.id, user.email) });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = unwrap(
      await db().from("User").select(PUBLIC_USER_FIELDS).eq("id", req.user!.userId).maybeSingle()
    );
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

/** Look up a recipient's public key (needed by a logged-in sender to wrap a file key). */
authRouter.get("/public-key", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = z.string().email().parse(req.query.email).toLowerCase();
    const user = unwrap(
      await db()
        .from("User")
        .select("id,email,displayName,publicKey,publicKeyFingerprint")
        .eq("email", email)
        .maybeSingle()
    );
    if (!user) {
      res.status(404).json({ error: "Recipient not found" });
      return;
    }
    res.json({ recipient: user });
  } catch (err) {
    next(err);
  }
});
