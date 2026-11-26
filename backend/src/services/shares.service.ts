import { db, parseUtcDate, Row, toUtcIso, unwrap } from "../lib/db";

/**
 * Loads all share events (public links + per-recipient key shares) for the given files.
 * A share is independent of its file: revoking a share never touches the file.
 */
export async function loadSharesForItems(
  itemIds: string[]
): Promise<{ links: Row[]; recipients: Row[] }> {
  if (itemIds.length === 0) return { links: [] as Row[], recipients: [] as Row[] };

  const rawLinks = (unwrap(
    await db()
      .from("ShareLink")
      .select(
        "id,itemId,token,passwordHash,isPassphraseProtected,maxDownloads,downloadCount,burnAfterReading,expiresAt,isRevoked,createdAt"
      )
      .in("itemId", itemIds)
      .order("createdAt", { ascending: false })
  ) ?? []) as Row[];

  const rawRecipients = (unwrap(
    await db()
      .from("RecipientKey")
      .select(
        "id,itemId,recipientId,maxDownloads,downloadCount,burnAfterReading,isRevoked,createdAt"
      )
      .in("itemId", itemIds)
      .order("createdAt", { ascending: false })
  ) ?? []) as Row[];

  const userIds = Array.from(new Set(rawRecipients.map((r) => r.recipientId)));
  const users = userIds.length
    ? ((unwrap(
        await db().from("User").select("id,email,username,displayName").in("id", userIds)
      ) ?? []) as Row[])
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const links = rawLinks.map((l) => ({
    id: l.id,
    itemId: l.itemId,
    token: l.token,
    requiresPassword: Boolean(l.passwordHash),
    isPassphraseProtected: l.isPassphraseProtected,
    maxDownloads: l.maxDownloads,
    downloadCount: l.downloadCount,
    burnAfterReading: l.burnAfterReading,
    expiresAt: toUtcIso(l.expiresAt),
    isRevoked: l.isRevoked,
    createdAt: toUtcIso(l.createdAt),
  }));

  const recipients = rawRecipients.map((r) => {
    const u = userById.get(r.recipientId);
    return {
      id: r.id,
      itemId: r.itemId,
      recipient: u
        ? { id: u.id, email: u.email, username: u.username, displayName: u.displayName }
        : { id: r.recipientId },
      maxDownloads: r.maxDownloads,
      downloadCount: r.downloadCount,
      burnAfterReading: r.burnAfterReading,
      isRevoked: r.isRevoked,
      createdAt: toUtcIso(r.createdAt),
    };
  });

  return { links, recipients };
}

export function isLinkActive(l: Row) {
  return (
    !l.isRevoked &&
    parseUtcDate(l.expiresAt) > new Date() &&
    (l.maxDownloads === null || l.downloadCount < l.maxDownloads)
  );
}

export function isRecipientActive(r: Row) {
  return !r.isRevoked && (r.maxDownloads === null || r.downloadCount < r.maxDownloads);
}
