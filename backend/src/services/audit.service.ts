import { EventEmitter } from "events";
import { AccessAction } from "@prisma/client";
import { Request } from "express";
import { prisma } from "../lib/prisma";

export const auditEvents = new EventEmitter();
auditEvents.setMaxListeners(100);

interface LogAccessParams {
  itemId: string;
  action: AccessAction;
  shareLinkId?: string;
  accessorUserId?: string;
  req?: Request;
}

/**
 * Persists an access audit event and broadcasts it to any live SSE listeners for the item.
 */
export async function logAccess({
  itemId,
  action,
  shareLinkId,
  accessorUserId,
  req,
}: LogAccessParams) {
  const ipAddress =
    (req?.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req?.socket?.remoteAddress ||
    null;
  const userAgent = req?.headers["user-agent"] || null;

  const entry = await prisma.accessLog.create({
    data: {
      itemId,
      action,
      shareLinkId: shareLinkId ?? null,
      accessorUserId: accessorUserId ?? null,
      ipAddress,
      userAgent,
    },
  });

  auditEvents.emit(`item:${itemId}`, entry);
  return entry;
}
