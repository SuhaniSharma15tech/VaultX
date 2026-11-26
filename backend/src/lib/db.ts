import crypto from "crypto";
import { Request } from "express";
import { getSupabaseClient } from "./supabase";

/** Supabase client over HTTPS (port 443). */
export const db = () => getSupabaseClient();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

/** Throws on Supabase error, otherwise returns data. */
export function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Like unwrap, but also guarantees a non-null row (for insert/update ... single()). */
export function unwrapOne<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  const data = unwrap(res);
  if (data === null || data === undefined) throw new Error("Expected a row but got none");
  return data as NonNullable<T>;
}

/**
 * Prisma `TIMESTAMP(3)` columns come back from PostgREST without a trailing `Z`.
 * Treat them as UTC explicitly.
 */
export function parseUtcDate(val: string): Date {
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(val);
  return new Date(hasTz ? val : `${val}Z`);
}

export function toUtcIso(val: string): string {
  return parseUtcDate(val).toISOString();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Privacy-preserving short hash of the client IP. */
export function hashIp(req?: Request): string {
  const raw =
    (req?.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req?.socket?.remoteAddress ||
    "unknown";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/** Returns the vault item if (and only if) it belongs to the given user. */
export async function getOwnedItem(itemId: string, userId: string): Promise<Row | null> {
  const item = unwrap(
    await db().from("VaultItem").select("*").eq("id", itemId).maybeSingle()
  ) as Row | null;
  if (!item || item.ownerId !== userId) return null;
  return item;
}
