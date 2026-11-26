import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { env } from "../config/env";
import { getSupabaseClient } from "../lib/supabase";

function useSupabaseStorage(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_BUCKET);
}

/**
 * Ensures the encrypted blob storage directory exists (for local disk fallback).
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
 * Saves an encrypted ciphertext buffer to Supabase Storage (if configured) or local disk.
 */
export async function saveBlobBuffer(blobKey: string, buffer: Buffer): Promise<void> {
  if (useSupabaseStorage()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage
      .from(env.SUPABASE_BUCKET)
      .upload(blobKey, buffer, {
        contentType: "application/octet-stream",
        upsert: false,
      });
    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }
    return;
  }

  await fsp.writeFile(resolveBlobPath(blobKey), buffer);
}

/**
 * Reads an encrypted ciphertext buffer from Supabase Storage (if configured) or local disk.
 */
export async function readBlobBuffer(blobKey: string): Promise<Buffer> {
  if (useSupabaseStorage()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(env.SUPABASE_BUCKET)
      .download(blobKey);
    if (error || !data) {
      throw new Error(`Supabase Storage download failed: ${error?.message || "No data"}`);
    }
    const ab = await data.arrayBuffer();
    return Buffer.from(ab);
  }

  return fsp.readFile(resolveBlobPath(blobKey));
}

/**
 * Returns a readable stream for an encrypted blob on local disk.
 */
export function getBlobReadStream(blobKey: string): fs.ReadStream {
  const fullPath = resolveBlobPath(blobKey);
  return fs.createReadStream(fullPath);
}

/**
 * Checks whether an encrypted blob exists in Supabase Storage or on local disk.
 */
export async function blobExists(blobKey: string): Promise<boolean> {
  if (useSupabaseStorage()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(env.SUPABASE_BUCKET)
      .list("", { search: blobKey, limit: 1 });
    if (error) return false;
    return Boolean(data && data.some((f) => f.name === blobKey));
  }

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
  if (useSupabaseStorage()) {
    const buf = await readBlobBuffer(blobKey);
    const slice = buf.subarray(0, maxBytes);
    return {
      hexPreview: slice.toString("hex"),
      base64Preview: slice.toString("base64"),
      totalBytes: buf.byteLength,
    };
  }

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
 * Permanently deletes an encrypted blob from Supabase Storage or local disk.
 */
export async function deleteBlob(blobKey: string | null | undefined): Promise<void> {
  if (!blobKey) return;

  if (useSupabaseStorage()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(env.SUPABASE_BUCKET).remove([blobKey]);
    if (error) {
      console.warn(`[storage] Failed to remove ${blobKey} from Supabase:`, error.message);
    }
    return;
  }

  try {
    await fsp.unlink(resolveBlobPath(blobKey));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}
