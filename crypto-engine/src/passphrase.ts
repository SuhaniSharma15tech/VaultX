import { fromBase64Url, getSubtle, randomBytes, toBase64Url } from "./encoding";

const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

async function deriveWrappingKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Wraps an AES-256-GCM file key with a user passphrase via PBKDF2-SHA256.
 * Output format: `<salt>.<iv>.<wrappedKey>` (URL-safe for #key fragment).
 */
export async function wrapKeyWithPassphrase(
  aesKey: CryptoKey,
  passphrase: string
): Promise<string> {
  const subtle = getSubtle();
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const wrappingKey = await deriveWrappingKey(passphrase, salt);
  const rawAesKey = await subtle.exportKey("raw", aesKey);

  const wrapped = await subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, rawAesKey);
  return `${toBase64Url(salt)}.${toBase64Url(iv)}.${toBase64Url(wrapped)}`;
}

/**
 * Unwraps a PBKDF2-protected AES-256-GCM key token using the recipient's passphrase.
 */
export async function unwrapKeyWithPassphrase(
  wrappedToken: string,
  passphrase: string
): Promise<CryptoKey> {
  const parts = wrappedToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid passphrase-wrapped key format");
  }

  const [saltStr, ivStr, wrappedStr] = parts;
  const salt = fromBase64Url(saltStr);
  const iv = fromBase64Url(ivStr);
  const wrapped = fromBase64Url(wrappedStr);

  const wrappingKey = await deriveWrappingKey(passphrase, salt);
  const rawAesKey = await getSubtle().decrypt({ name: "AES-GCM", iv }, wrappingKey, wrapped);

  return getSubtle().importKey(
    "raw",
    rawAesKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
