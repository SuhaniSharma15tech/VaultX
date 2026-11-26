import cron from "node-cron";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { getSupabaseClient } from "../lib/supabase";
import { deleteBlob } from "./storage.service";

/**
 * Purges expired or revoked vault items and deletes their encrypted blobs from disk.
 */
export async function purgeExpiredItems(): Promise<number> {
  const nowIso = new Date().toISOString();

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = getSupabaseClient();
    const { data: expired, error } = await supabase
      .from("VaultItem")
      .select("id, blobKey")
      .or(`expiresAt.lte.${nowIso},isRevoked.eq.true`);

    if (error) {
      throw new Error(`Supabase cleanup query failed: ${error.message}`);
    }
    if (!expired || expired.length === 0) return 0;

    await Promise.all(expired.map((item) => deleteBlob(item.blobKey)));

    const { error: delError } = await supabase
      .from("VaultItem")
      .delete()
      .in(
        "id",
        expired.map((i) => i.id)
      );

    if (delError) {
      throw new Error(`Supabase cleanup delete failed: ${delError.message}`);
    }

    return expired.length;
  }

  const now = new Date();
  const expired = await prisma.vaultItem.findMany({
    where: {
      OR: [{ expiresAt: { lte: now } }, { isRevoked: true }],
    },
    select: { id: true, blobKey: true },
  });

  if (expired.length === 0) return 0;

  await Promise.all(expired.map((item) => deleteBlob(item.blobKey)));

  await prisma.vaultItem.deleteMany({
    where: { id: { in: expired.map((i) => i.id) } },
  });

  return expired.length;
}

/**
 * Starts a background cron job every minute to enforce TTL expiry and blob deletion.
 */
export function startCleanupScheduler(): void {
  cron.schedule("* * * * *", async () => {
    try {
      const count = await purgeExpiredItems();
      if (count > 0) {
        console.log(`[cleanup] Purged ${count} expired/revoked vault item(s)`);
      }
    } catch (err) {
      console.error("[cleanup] Failed to purge expired items:", err);
    }
  });
}
