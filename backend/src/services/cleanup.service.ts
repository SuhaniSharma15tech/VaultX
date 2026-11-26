import cron from "node-cron";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { getSupabaseClient } from "../lib/supabase";
import { deleteBlob } from "./storage.service";

/**
 * Purges encrypted blobs for expired or revoked vault items immediately,
 * while keeping tombstone + audit logs for 24h so the sender dashboard can still inspect them.
 */
export async function purgeExpiredItems(): Promise<number> {
  const now = new Date();
  const nowIso = now.toISOString();
  const hardDeleteCutoffIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = getSupabaseClient();

    // 1. Delete blobs from Supabase Storage for newly expired/revoked items (keep audit logs)
    const { data: toScrub, error } = await supabase
      .from("VaultItem")
      .select("id, blobKey")
      .not("blobKey", "is", null)
      .or(`expiresAt.lte.${nowIso},isRevoked.eq.true`);

    if (error) {
      throw new Error(`Supabase cleanup query failed: ${error.message}`);
    }

    if (toScrub && toScrub.length > 0) {
      await Promise.all(toScrub.map((item) => deleteBlob(item.blobKey)));
      await supabase
        .from("VaultItem")
        .update({ blobKey: null, burned: true })
        .in(
          "id",
          toScrub.map((i) => i.id)
        );
    }

    // 2. Hard-delete DB rows only 24h after expiry
    const { data: oldItems } = await supabase
      .from("VaultItem")
      .select("id")
      .lte("expiresAt", hardDeleteCutoffIso);

    if (oldItems && oldItems.length > 0) {
      await supabase
        .from("VaultItem")
        .delete()
        .in(
          "id",
          oldItems.map((i) => i.id)
        );
    }

    return toScrub?.length ?? 0;
  }

  const toScrub = await prisma.vaultItem.findMany({
    where: {
      blobKey: { not: null },
      OR: [{ expiresAt: { lte: now } }, { isRevoked: true }],
    },
    select: { id: true, blobKey: true },
  });

  if (toScrub.length > 0) {
    await Promise.all(toScrub.map((item) => deleteBlob(item.blobKey)));
    await prisma.vaultItem.updateMany({
      where: { id: { in: toScrub.map((i) => i.id) } },
      data: { blobKey: null, burned: true },
    });
  }

  await prisma.vaultItem.deleteMany({
    where: { expiresAt: { lte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
  });

  return toScrub.length;
}

/**
 * Starts a background cron job every minute to enforce TTL expiry and blob deletion.
 */
export function startCleanupScheduler(): void {
  cron.schedule("* * * * *", async () => {
    try {
      const count = await purgeExpiredItems();
      if (count > 0) {
        console.log(`[cleanup] Scrubbed ${count} expired/revoked vault blob(s)`);
      }
    } catch (err) {
      console.error("[cleanup] Failed to purge expired items:", err);
    }
  });
}
