import { fromBase64, fromBase64Url, getSubtle, randomBytes, toBase64, toBase64Url, toHex } from "./encoding";

const AES_ALGO = "AES-GCM";
const AES_KEY_BITS = 256;
const GCM_IV_BYTES = 12;

export interface VaultMetadata {
  filename: string;
  mimeType: string;
  size: number;
}

export interface EncryptedFileResult {
  encryptedBlob: Blob;
  encryptedMetadata: string;
  metadataIv: string;
  fileIv: string;
  sha256Checksum: string;
  aesKey: CryptoKey;
  exportedKeyBase64Url: string;
}

export interface EncryptedSecretNoteResult {
  encryptedPayload: string;
  encryptedMetadata: string;
  metadataIv: string;
  fileIv: string;
  sha256Checksum: string;
  aesKey: CryptoKey;
  exportedKeyBase64Url: string;
}

/**
 * Generates a fresh 256-bit AES-GCM key inside the browser.
 */
export async function generateAesKey(): Promise<CryptoKey> {
  return getSubtle().generateKey(
    { name: AES_ALGO, length: AES_KEY_BITS },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Exports a 256-bit AES key as a URL-safe base64url string (for URL #fragment).
 */
export async function exportAesKey(key: CryptoKey): Promise<string> {
  const raw = await getSubtle().exportKey("raw", key);
  return toBase64Url(raw);
}

/**
 * Imports a 256-bit AES-GCM key from a base64url string.
 */
export async function importAesKey(keyBase64Url: string): Promise<CryptoKey> {
  const raw = fromBase64Url(keyBase64Url);
  return getSubtle().importKey("raw", raw, { name: AES_ALGO, length: AES_KEY_BITS }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Computes a SHA-256 hex digest (used for client-side tamper verification).
 */
export async function sha256Hex(data: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await getSubtle().digest("SHA-256", data);
  return toHex(digest);
}

/**
 * Verifies ciphertext SHA-256 checksum against the expected server-stored checksum.
 */
export async function verifyChecksum(
  ciphertext: ArrayBuffer | Uint8Array<ArrayBuffer>,
  expectedSha256Hex: string
): Promise<boolean> {
  const actual = await sha256Hex(ciphertext);
  return actual.toLowerCase() === expectedSha256Hex.toLowerCase();
}

async function encryptMetadata(
  metadata: VaultMetadata,
  aesKey: CryptoKey
): Promise<{ encryptedMetadata: string; metadataIv: string }> {
  const iv = randomBytes(GCM_IV_BYTES);
  const encoded = new TextEncoder().encode(JSON.stringify(metadata));
  const cipher = await getSubtle().encrypt({ name: AES_ALGO, iv }, aesKey, encoded);
  return {
    encryptedMetadata: toBase64(cipher),
    metadataIv: toBase64(iv),
  };
}

/**
 * Encrypts a browser File + its filename/MIME metadata using AES-256-GCM.
 */
export async function encryptFileForUpload(file: File): Promise<EncryptedFileResult> {
  const aesKey = await generateAesKey();
  const fileIv = randomBytes(GCM_IV_BYTES);
  const plaintext = await file.arrayBuffer();

  const ciphertext = await getSubtle().encrypt(
    { name: AES_ALGO, iv: fileIv },
    aesKey,
    plaintext
  );

  const sha256Checksum = await sha256Hex(ciphertext);
  const { encryptedMetadata, metadataIv } = await encryptMetadata(
    {
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    },
    aesKey
  );

  return {
    encryptedBlob: new Blob([ciphertext], { type: "application/octet-stream" }),
    encryptedMetadata,
    metadataIv,
    fileIv: toBase64(fileIv),
    sha256Checksum,
    aesKey,
    exportedKeyBase64Url: await exportAesKey(aesKey),
  };
}

/**
 * Encrypts a one-time secret text note + metadata using AES-256-GCM.
 */
export async function encryptSecretNoteForUpload(
  noteText: string,
  title = "secret-note.txt"
): Promise<EncryptedSecretNoteResult> {
  const aesKey = await generateAesKey();
  const fileIv = randomBytes(GCM_IV_BYTES);
  const plaintext = new TextEncoder().encode(noteText);

  const ciphertext = await getSubtle().encrypt(
    { name: AES_ALGO, iv: fileIv },
    aesKey,
    plaintext
  );

  const sha256Checksum = await sha256Hex(ciphertext);
  const { encryptedMetadata, metadataIv } = await encryptMetadata(
    {
      filename: title,
      mimeType: "text/plain;charset=utf-8",
      size: plaintext.byteLength,
    },
    aesKey
  );

  return {
    encryptedPayload: toBase64(ciphertext),
    encryptedMetadata,
    metadataIv,
    fileIv: toBase64(fileIv),
    sha256Checksum,
    aesKey,
    exportedKeyBase64Url: await exportAesKey(aesKey),
  };
}

/**
 * Decrypts file/note metadata (filename, MIME type, size).
 */
export async function decryptMetadata(
  encryptedMetadataB64: string,
  metadataIvB64: string,
  aesKey: CryptoKey
): Promise<VaultMetadata> {
  const cipher = fromBase64(encryptedMetadataB64);
  const iv = fromBase64(metadataIvB64);
  const plain = await getSubtle().decrypt({ name: AES_ALGO, iv }, aesKey, cipher);
  return JSON.parse(new TextDecoder().decode(plain)) as VaultMetadata;
}

/**
 * Verifies SHA-256 checksum (if provided) and decrypts a downloaded file ciphertext.
 */
export async function decryptFile(
  ciphertext: ArrayBuffer,
  fileIvB64: string,
  aesKey: CryptoKey,
  expectedSha256Hex?: string
): Promise<ArrayBuffer> {
  if (expectedSha256Hex) {
    const valid = await verifyChecksum(ciphertext, expectedSha256Hex);
    if (!valid) {
      throw new Error("SHA-256 checksum mismatch: ciphertext may have been tampered with");
    }
  }
  const iv = fromBase64(fileIvB64);
  return getSubtle().decrypt({ name: AES_ALGO, iv }, aesKey, ciphertext);
}

/**
 * Verifies SHA-256 checksum (if provided) and decrypts a secret note payload.
 */
export async function decryptSecretNote(
  encryptedPayloadB64: string,
  fileIvB64: string,
  aesKey: CryptoKey,
  expectedSha256Hex?: string
): Promise<string> {
  const cipher = fromBase64(encryptedPayloadB64);
  if (expectedSha256Hex) {
    const valid = await verifyChecksum(cipher, expectedSha256Hex);
    if (!valid) {
      throw new Error("SHA-256 checksum mismatch: secret note may have been tampered with");
    }
  }
  const iv = fromBase64(fileIvB64);
  const plain = await getSubtle().decrypt({ name: AES_ALGO, iv }, aesKey, cipher);
  return new TextDecoder().decode(plain);
}
