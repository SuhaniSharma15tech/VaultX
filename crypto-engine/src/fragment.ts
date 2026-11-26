/**
 * URL #fragment helpers: #key=... stays strictly in the browser and is never sent in HTTP requests.
 */

export function buildShareUrl(baseUrl: string, token: string, keyFragment: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/s/${encodeURIComponent(token)}#key=${encodeURIComponent(keyFragment)}`;
}

export function extractKeyFromHash(hash?: string): string | null {
  const rawHash = hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  if (!rawHash) return null;

  const cleaned = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  const params = new URLSearchParams(cleaned);
  const key = params.get("key");
  return key && key.length > 0 ? key : null;
}
