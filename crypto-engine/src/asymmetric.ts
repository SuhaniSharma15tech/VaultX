import { fromBase64, getSubtle, randomBytes, toBase64, toHex } from "./encoding";

const RSA_ALGO = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const PBKDF2_ITERATIONS = 310_000;

export interface GeneratedUserKeyPair {
  publicKey: string; // SPKI base64
  publicKeyFingerprint: string; // SHA-256 hex of SPKI
  privateKey: CryptoKey;
}

/**
 * Generates an RSA-OAEP (2048-bit, SHA-256) key pair on the client for registered-user sharing.
 */
export async function generateUserKeyPair(): Promise<GeneratedUserKeyPair> {
  const subtle = getSubtle();
  const keyPair = await subtle.generateKey(RSA_ALGO, true, ["encrypt", "decrypt"]);

  const spki = await subtle.exportKey("spki", keyPair.publicKey);
  const fingerprintDigest = await subtle.digest("SHA-256", spki);

  return {
    publicKey: toBase64(spki),
    publicKeyFingerprint: toHex(fingerprintDigest),
    privateKey: keyPair.privateKey,
  };
}

/**
 * Wraps a file's AES-256-GCM key with a registered recipient's RSA-OAEP public key.
 */
export async function wrapAesKeyForRecipient(
  aesKey: CryptoKey,
  recipientPublicKeyB64: string
): Promise<string> {
  const subtle = getSubtle();
  const spki = fromBase64(recipientPublicKeyB64);
  const publicKey = await subtle.importKey(
    "spki",
    spki,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  const rawAesKey = await subtle.exportKey("raw", aesKey);
  const wrapped = await subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawAesKey);
  return toBase64(wrapped);
}

/**
 * Unwraps a received AES-256-GCM key using the recipient's RSA-OAEP private key.
 */
export async function unwrapAesKeyWithPrivateKey(
  wrappedAesKeyB64: string,
  privateKey: CryptoKey
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const wrapped = fromBase64(wrappedAesKeyB64);
  const rawAesKey = await subtle.decrypt({ name: "RSA-OAEP" }, privateKey, wrapped);

  return subtle.importKey(
    "raw",
    rawAesKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts the user's private key (PKCS8) with their login password for optional server backup.
 */
export async function exportPrivateKeyWithPassword(
  privateKey: CryptoKey,
  password: string
): Promise<string> {
  const subtle = getSubtle();
  const pkcs8 = await subtle.exportKey("pkcs8", privateKey);
  const salt = randomBytes(16);
  const iv = randomBytes(12);

  const baseKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const wrappingKey = await subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const cipher = await subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, pkcs8);
  return JSON.stringify({
    salt: toBase64(salt),
    iv: toBase64(iv),
    cipher: toBase64(cipher),
  });
}

/**
 * Restores the user's RSA-OAEP private key from an encrypted backup using their password.
 */
export async function importPrivateKeyWithPassword(
  encryptedPrivateKeyJson: string,
  password: string
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const { salt, iv, cipher } = JSON.parse(encryptedPrivateKeyJson) as {
    salt: string;
    iv: string;
    cipher: string;
  };

  const baseKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const wrappingKey = await subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const pkcs8 = await subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    wrappingKey,
    fromBase64(cipher)
  );

  return subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}
