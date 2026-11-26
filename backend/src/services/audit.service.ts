import crypto from "crypto";
import { EventEmitter } from "events";
import { Request } from "express";
import { db, hashIp, nowIso } from "../lib/db";

export const auditEvents = new EventEmitter();
auditEvents.setMaxListeners(100);

export type AccessActionName =
  | "CREATED"
  | "VIEW_META"
  | "DOWNLOAD_SUCCESS"
  | "DENIED_PASSWORD"
  | "DENIED_EXPIRED"
  | "DENIED_REVOKED"
  | "DENIED_LIMIT"
  | "BURNED"
  | "REVOKED";

interface LogAccessParams {
  itemId: string;
  action: AccessActionName;
  shareLinkId?: string;
  accessorUserId?: string;
  req?: Request;
}

/**
 * Persists an access audit event (IP is stored only as a short hash)
 * and broadcasts it to any live SSE listeners for the item.
 */
export async function logAccess({
  itemId,
  action,
  shareLinkId,
  accessorUserId,
  req,
}: LogAccessParams) {
  const row = {
    id: crypto.randomUUID(),
    itemId,
    action,
    shareLinkId: shareLinkId ?? null,
    accessorUserId: accessorUserId ?? null,
    ipHash: hashIp(req),
    userAgent: (req?.headers["user-agent"] as string) ?? null,
    createdAt: nowIso(),
  };

  const { error } = await db().from("AccessLog").insert(row);
  if (error) {
    console.error("[audit] Failed to write access log:", error.message);
    return row;
  }

  auditEvents.emit(`item:${itemId}`, row);
  return row;
}
