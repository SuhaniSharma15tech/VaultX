import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { env } from "../config/env";

/**
 * Ensures the encrypted blob storage directory exists.
 */
export async function ensureStorageDir(): Promise<void> {
  await fsp.mkdir(env.BLOB_STORAGE_PATH, { recursive: true });
}

/**
 * Resolves a blob key safely inside BLOB_STORAGE_PATH to prevent path traversal.
 */
function resolveBlobPath(blobKey: string): string {
  const safeName = path.basename(blobKey);
  const fullPath = path.resolve(env.BLOB_STORAGE_PATH, safeName);
  if (!fullPath.startsWith(env.BLOB_STORAGE_PATH)) {
    throw new Error("Invalid blob key");
  }
  return fullPath;
}

/**
 * Generates a unique opaque blob key (UUID + .enc) with zero metadata leakage.
 */
export function generateBlobKey(): string {
  return `${crypto.randomUUID()}.enc`;
}

/**
 * Returns a readable stream for an encrypted blob on disk.
 */
export function getBlobReadStream(blobKey: string): fs.ReadStream {
  const fullPath = resolveBlobPath(blobKey);
  return fs.createReadStream(fullPath);
}

/**
 * Checks whether an encrypted blob exists on disk.
 */
export async function blobExists(blobKey: string): Promise<boolean> {
  try {
    await fsp.access(resolveBlobPath(blobKey));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the first N bytes of raw ciphertext for the Live Server Inspector.
 */
export async function readBlobInspectorSample(
  blobKey: string,
  maxBytes = 256
): Promise<{ hexPreview: string; base64Preview: string; totalBytes: number }> {
  const fullPath = resolveBlobPath(blobKey);
  const stat = await fsp.stat(fullPath);
  const handle = await fsp.open(fullPath, "r");
  try {
    const length = Math.min(maxBytes, stat.size);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return {
      hexPreview: buffer.toString("hex"),
      base64Preview: buffer.toString("base64"),
      totalBytes: stat.size,
    };
  } finally {
    await handle.close();
  }
}

/**
 * Permanently deletes an encrypted blob from disk (used by burn-after-reading, TTL, and kill-switch).
 */
export async function deleteBlob(blobKey: string | null | undefined): Promise<void> {
  if (!blobKey) return;
  try {
    await fsp.unlink(resolveBlobPath(blobKey));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}
