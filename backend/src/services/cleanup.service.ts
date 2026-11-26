import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { deleteBlob } from "./storage.service";

/**
 * Purges expired or revoked vault items and deletes their encrypted blobs from disk.
 */
export async function purgeExpiredItems(): Promise<number> {
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
