import { Router, Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
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

authRouter.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });

    const user = await prisma.user.create({
      data: {
        email: data.email,
        displayName: data.displayName,
        passwordHash,
        publicKey: data.publicKey,
        publicKeyFingerprint: data.publicKeyFingerprint,
        encryptedPrivateKey: data.encryptedPrivateKey,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        publicKey: true,
        publicKeyFingerprint: true,
        createdAt: true,
      },
    });

    const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    });

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await argon2.verify(user.passwordHash, data.password);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = jwt.sign({ userId: user.id, email: user.email ?? "" }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        publicKey: user.publicKey,
        publicKeyFingerprint: user.publicKeyFingerprint,
        encryptedPrivateKey: user.encryptedPrivateKey,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        publicKey: true,
        publicKeyFingerprint: true,
        encryptedPrivateKey: true,
        createdAt: true,
      },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

authRouter.get(
  "/public-key",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = z.string().email().parse(req.query.email);
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          displayName: true,
          publicKey: true,
          publicKeyFingerprint: true,
        },
      });
      if (!user) {
        res.status(404).json({ error: "Recipient not found" });
        return;
      }
      res.json({ recipient: user });
    } catch (err) {
      next(err);
    }
  }
);
