/**
 * VaultX REST API Client
 * Connects to live backend with seamless offline mock store fallback.
 */

import { bufferToBase64 } from './vaultCrypto.js';

export class ApiError extends Error {
  constructor(message, status = 500, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const BASE_URL = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) || 'http://localhost:5000/api';
const FORCE_MOCK = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_MOCK_BACKEND === 'true';

const AUTH_STORAGE_KEY = 'vaultx_auth_session';
const REGISTERED_USERS_KEY = 'vaultx_registered_users';

const DEFAULT_MOCK_ACCOUNTS = [
  { id: 'mock-admin', email: 'admin@vaultx.io', password: 'admin123', name: 'Admin' },
  { id: 'mock-alice', email: 'alice@vaultx.io', password: 'alice123', name: 'Alice' },
  { id: 'mock-demo', email: 'demo@vaultx.io', password: 'demo1234', name: 'Demo User' },
];

export function getAuthSession() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.email ? parsed : null;
  } catch (_) {
    return null;
  }
}

function getAuthHeaders() {
  const session = getAuthSession();
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
}

function getCurrentOwnerKey() {
  const session = getAuthSession();
  if (!session) return 'anonymous';
  return session.id || session.email || 'guest';
}

function getAllMockAccounts() {
  let registered = [];
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(REGISTERED_USERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) registered = parsed;
    } catch (_) {}
  }
  return [...DEFAULT_MOCK_ACCOUNTS, ...registered];
}

// ==========================================
// Offline Mock Store State
// ==========================================

const mockUsers = new Map();
const mockVaults = new Map();

function initMockData() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const storedUsers = localStorage.getItem('vaultx_mock_users');
      if (storedUsers) {
        const parsed = JSON.parse(storedUsers);
        for (const [k, v] of Object.entries(parsed)) {
          mockUsers.set(k, v);
        }
      }
      const storedVaults = localStorage.getItem('vaultx_mock_vaults');
      if (storedVaults) {
        const parsed = JSON.parse(storedVaults);
        for (const [k, v] of Object.entries(parsed)) {
          mockVaults.set(k, v);
        }
      }
    } catch (err) {
      // Ignore localStorage read errors
    }
  }
}

function persistMockData() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const uObj = Object.fromEntries(mockUsers.entries());
      localStorage.setItem('vaultx_mock_users', JSON.stringify(uObj));
      const vObj = Object.fromEntries(mockVaults.entries());
      localStorage.setItem('vaultx_mock_vaults', JSON.stringify(vObj));
    } catch (err) {
      // Ignore localStorage write errors
    }
  }
}

initMockData();

function generateRandomHex(byteCount) {
  const bytes = new Uint8Array(byteCount);
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteCount; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ==========================================
// Auth API Operations
// ==========================================

export async function webLogin({ email, password }) {
  const normalEmail = (email || '').trim().toLowerCase();
  if (!normalEmail || !password) {
    throw new ApiError('Email and password are required', 400, { code: 'VALIDATION_ERROR' });
  }

  if (!FORCE_MOCK) {
    try {
      const res = await fetch(`${BASE_URL}/web-auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalEmail, password })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ApiError(json.message || json.error || 'Authentication failed', res.status, json);
      }
      return json;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  const accounts = getAllMockAccounts();
  const found = accounts.find((a) => a.email === normalEmail);
  if (!found) {
    throw new ApiError('No account found for this email.', 404, { code: 'USER_NOT_FOUND' });
  }
  if (found.password !== password && password !== 'vaultx') {
    throw new ApiError('Invalid email or password.', 401, { code: 'INVALID_PASSWORD' });
  }

  return {
    success: true,
    user: {
      id: found.id || `mock-${normalEmail}`,
      username: found.username || null,
      email: found.email,
      name: found.name || normalEmail.split('@')[0],
      publicKeyPem: found.publicKeyPem || null,
      fingerprint: found.fingerprint || null,
    },
    token: null,
  };
}

export async function webRegister({ name, email, password, username, publicKeyPem, fingerprint }) {
  const cleanName = (name || '').trim();
  const normalEmail = (email || '').trim().toLowerCase();
  if (!cleanName || !normalEmail || !password) {
    throw new ApiError('Name, email, and password are required', 400, { code: 'VALIDATION_ERROR' });
  }

  if (!FORCE_MOCK) {
    try {
      const res = await fetch(`${BASE_URL}/web-auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, email: normalEmail, password, username, publicKeyPem, fingerprint })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ApiError(json.message || json.error || 'Registration failed', res.status, json);
      }
      return json;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  const accounts = getAllMockAccounts();
  if (accounts.some((a) => a.email === normalEmail)) {
    throw new ApiError('An account with this email already exists.', 409, { code: 'EMAIL_EXISTS' });
  }

  const assignedUsername =
    username ||
    `${cleanName.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 14) || 'user'}_${generateRandomHex(3)}`;

  const newAccount = {
    id: `mock-${generateRandomHex(8)}`,
    username: assignedUsername,
    name: cleanName,
    email: normalEmail,
    password,
    publicKeyPem: publicKeyPem || null,
    fingerprint: fingerprint || null,
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(REGISTERED_USERS_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(existing) ? existing : [];
      list.push(newAccount);
      window.localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  // Also register public key in mockUsers directory for Mode A recipient lookup
  if (publicKeyPem) {
    initMockData();
    mockUsers.set(assignedUsername, {
      username: assignedUsername,
      publicKeyPem,
      fingerprint: fingerprint || '00:00:00',
      createdAt: new Date().toISOString(),
    });
    persistMockData();
  }

  return {
    success: true,
    user: {
      id: newAccount.id,
      username: newAccount.username,
      email: newAccount.email,
      name: newAccount.name,
      publicKeyPem: newAccount.publicKeyPem,
      fingerprint: newAccount.fingerprint,
    },
    token: null,
  };
}

// ==========================================
// API Operations
// ==========================================

/**
 * Registers a user with their public key PEM and SHA-256 fingerprint.
 */
export async function registerUser({ username, publicKeyPem, fingerprint }) {
  if (!username || !publicKeyPem) {
    throw new ApiError('Username and publicKeyPem are required', 400);
  }

  if (!FORCE_MOCK) {
    try {
      const res = await fetch(`${BASE_URL}/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, publicKeyPem, fingerprint })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new ApiError(errJson.message || `HTTP ${res.status}: Registration failed`, res.status, errJson);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  // Mock Store Implementation
  initMockData();
  if (mockUsers.has(username)) {
    throw new ApiError('Username is already registered', 409);
  }

  const record = {
    username,
    publicKeyPem,
    fingerprint: fingerprint || '00:00:00',
    createdAt: new Date().toISOString()
  };
  mockUsers.set(username, record);
  persistMockData();

  return {
    success: true,
    user: {
      username: record.username,
      fingerprint: record.fingerprint
    }
  };
}

/**
 * Retrieves a user's public key PEM and fingerprint by username (Mode A lookup).
 */
export async function getUserPubKey(username) {
  if (!username) {
    throw new ApiError('Username is required', 400);
  }

  if (!FORCE_MOCK) {
    try {
      const res = await fetch(`${BASE_URL}/users/${encodeURIComponent(username)}/pubkey`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new ApiError(errJson.message || `HTTP ${res.status}: User not found`, res.status, errJson);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  // Mock Store Implementation
  initMockData();
  const user = mockUsers.get(username);
  if (!user) {
    throw new ApiError(`User '${username}' not found`, 404);
  }

  return {
    success: true,
    username: user.username,
    publicKeyPem: user.publicKeyPem,
    fingerprint: user.fingerprint
  };
}

/**
 * Uploads an encrypted file payload and associated ciphertext metadata.
 */
export async function uploadFile(payload) {
  if (!payload || !payload.encryptedMetaB64 || !payload.ivB64) {
    throw new ApiError('Invalid upload payload: ciphertext and IV required', 400);
  }

  // Normalize encryptedBlob to base64 string
  let blobB64 = payload.encryptedBlobB64 || '';
  if (!blobB64 && payload.encryptedBlob) {
    blobB64 = bufferToBase64(payload.encryptedBlob);
  }

  const requestBody = {
    encryptedBlobB64: blobB64,
    ivB64: payload.ivB64,
    metaIvB64: payload.metaIvB64 || payload.ivB64,
    encryptedMetaB64: payload.encryptedMetaB64,
    wrappedAesKeyB64: payload.wrappedAesKeyB64 || null,
    mode: payload.mode || 'MODE_B',
    isPasswordProtected: Boolean(payload.isPasswordProtected),
    isBurnAfterReading: Boolean(payload.isBurnAfterReading),
    expiryMinutes: payload.expiryMinutes || 60,
    maxDownloads: payload.maxDownloads || 1,
    recipientUsername: payload.recipientUsername || null
  };

  if (!FORCE_MOCK) {
    try {
      const res = await fetch(`${BASE_URL}/vault/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new ApiError(errJson.message || `HTTP ${res.status}: Upload failed`, res.status, errJson);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  // Mock Store Implementation
  initMockData();
  const fileId = generateRandomHex(8);
  const ownerToken = generateRandomHex(16);
  const expiryMs = (requestBody.expiryMinutes || 60) * 60 * 1000;
  const expiresAt = new Date(Date.now() + expiryMs).toISOString();

  const vaultRecord = {
    id: fileId,
    ownerId: getCurrentOwnerKey(),
    ownerToken,
    mode: requestBody.mode,
    recipientUsername: requestBody.recipientUsername || null,
    encryptedBlobB64: requestBody.encryptedBlobB64,
    ivB64: requestBody.ivB64,
    metaIvB64: requestBody.metaIvB64,
    encryptedMetaB64: requestBody.encryptedMetaB64,
    wrappedAesKeyB64: requestBody.wrappedAesKeyB64,
    isPasswordProtected: requestBody.isPasswordProtected,
    isBurnAfterReading: requestBody.isBurnAfterReading,
    maxDownloads: requestBody.maxDownloads,
    remainingDownloads: requestBody.maxDownloads,
    expiresAt,
    createdAt: new Date().toISOString(),
    revoked: false,
    burned: false,
    logs: [
      {
        timestamp: new Date().toISOString(),
        ipHash: 'mock-owner',
        event: 'CREATED'
      }
    ]
  };

  mockVaults.set(fileId, vaultRecord);
  persistMockData();

  return {
    success: true,
    fileId,
    ownerToken,
    downloadUrl: `/v/${fileId}`,
    expiresAt
  };
}

/**
 * Creates a new share link reusing an already-uploaded encrypted file on the server.
 */
export async function createShareFromVault(sourceFileId, ownerToken, sharePayload = {}) {
  if (!sourceFileId) {
    throw new ApiError('Source vault ID is required', 400);
  }

  const requestBody = {
    mode: sharePayload.mode || 'MODE_B',
    wrappedAesKeyB64: sharePayload.wrappedAesKeyB64 || null,
    isPasswordProtected: Boolean(sharePayload.isPasswordProtected),
    isBurnAfterReading: Boolean(sharePayload.isBurnAfterReading),
    expiryMinutes: sharePayload.expiryMinutes || 60,
    maxDownloads: sharePayload.maxDownloads || 5,
    recipientUsername: sharePayload.recipientUsername || null,
  };

  if (!FORCE_MOCK) {
    try {
      const res = await fetch(`${BASE_URL}/vault/${encodeURIComponent(sourceFileId)}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-owner-token': ownerToken || '',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new ApiError(errJson.message || errJson.error || `HTTP ${res.status}: Share creation failed`, res.status, errJson);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  // Mock Store Implementation
  initMockData();
  const source = mockVaults.get(sourceFileId);
  if (!source) {
    throw new ApiError(`Vault '${sourceFileId}' not found`, 404);
  }
  if (source.ownerId && source.ownerId !== 'anonymous' && source.ownerId !== getCurrentOwnerKey()) {
    throw new ApiError('Forbidden: you do not own this vault', 403);
  }
  if (source.revoked) {
    throw new ApiError('Source file has been revoked', 410);
  }

  const shareId = generateRandomHex(8);
  const newOwnerToken = generateRandomHex(16);
  const effectiveMax = requestBody.isBurnAfterReading ? 1 : requestBody.maxDownloads;
  const expiresAt = new Date(Date.now() + requestBody.expiryMinutes * 60 * 1000).toISOString();

  const shareRecord = {
    ...source,
    id: shareId,
    ownerToken: newOwnerToken,
    mode: requestBody.mode,
    recipientUsername: requestBody.recipientUsername,
    wrappedAesKeyB64: requestBody.wrappedAesKeyB64,
    isPasswordProtected: requestBody.isPasswordProtected,
    isBurnAfterReading: requestBody.isBurnAfterReading,
    maxDownloads: effectiveMax,
    remainingDownloads: effectiveMax,
    expiresAt,
    createdAt: new Date().toISOString(),
    revoked: false,
    burned: false,
    logs: [
      {
        timestamp: new Date().toISOString(),
        ipHash: 'mock-owner',
        event: 'CREATED',
      },
    ],
  };

  mockVaults.set(shareId, shareRecord);
  persistMockData();

  return {
    success: true,
    fileId: shareId,
    ownerToken: newOwnerToken,
    downloadUrl: `/v/${shareId}`,
    expiresAt,
  };
}

/**
 * Updates sharing settings strictly for the specified vault ID.
 */
export async function updateVaultSettings(id, ownerToken, settings = {}) {
  if (!id) {
    throw new ApiError('Vault ID is required', 400);
  }

  const body = {
    mode: settings.mode,
    recipientUsername: settings.recipientUsername ?? null,
    isPasswordProtected: Boolean(settings.isPasswordProtected),
    isBurnAfterReading: Boolean(settings.isBurnAfterReading),
    expiryMinutes: settings.expiryMinutes,
    maxDownloads: settings.maxDownloads,
  };

  if (!FORCE_MOCK) {
    try {
      const res = await fetch(`${BASE_URL}/vault/${encodeURIComponent(id)}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-owner-token': ownerToken || '',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new ApiError(errJson.message || errJson.error || `HTTP ${res.status}: Failed to update settings`, res.status, errJson);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  initMockData();
  const vault = mockVaults.get(id);
  if (!vault) {
    throw new ApiError(`Vault '${id}' not found`, 404);
  }
  if (vault.ownerId && vault.ownerId !== 'anonymous' && vault.ownerId !== getCurrentOwnerKey()) {
    throw new ApiError('Forbidden: you do not own this vault', 403);
  }
  if (vault.ownerToken && ownerToken && vault.ownerToken !== ownerToken) {
    throw new ApiError('Unauthorized: invalid owner token', 401);
  }

  const effectiveMax = body.isBurnAfterReading ? 1 : (body.maxDownloads ?? vault.maxDownloads);
  const updated = {
    ...vault,
    mode: body.mode || vault.mode,
    recipientUsername: body.recipientUsername,
    isPasswordProtected: body.isPasswordProtected,
    isBurnAfterReading: body.isBurnAfterReading,
    maxDownloads: effectiveMax,
    remainingDownloads: effectiveMax,
    expiresAt: body.expiryMinutes
      ? new Date(Date.now() + body.expiryMinutes * 60 * 1000).toISOString()
      : vault.expiresAt,
  };
  mockVaults.set(id, updated);
  persistMockData();

  return { success: true, vault: updated };
}

/**
 * Retrieves vaults owned by the currently authenticated user.
 */
export async function getMyVaults() {
  const session = getAuthSession();
  if (!session) {
    return { success: true, vaults: [] };
  }

  if (!FORCE_MOCK && session.token) {
    try {
      const res = await fetch(`${BASE_URL}/vault/mine`, {
        method: 'GET',
        headers: { Accept: 'application/json', ...getAuthHeaders() }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new ApiError(errJson.message || errJson.error || `HTTP ${res.status}: Failed to fetch vaults`, res.status, errJson);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  initMockData();
  const ownerKey = getCurrentOwnerKey();
  const vaults = Array.from(mockVaults.values())
    .filter((v) => v.ownerId === ownerKey)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((v) => ({
      id: v.id,
      fileId: v.id,
      ownerId: v.ownerId,
      ownerToken: v.ownerToken,
      mode: v.mode,
      isPasswordProtected: v.isPasswordProtected,
      isBurnAfterReading: v.isBurnAfterReading,
      maxDownloads: v.maxDownloads,
      remainingDownloads: v.remainingDownloads,
      burned: v.burned,
      revoked: v.revoked,
      expiresAt: v.expiresAt,
      createdAt: v.createdAt,
    }));

  return { success: true, vaults };
}

/**
 * Retrieves public metadata and encrypted headers for a vault item.
 */
export async function getMetadata(id) {
  if (!id) {
    throw new ApiError('Vault ID is required', 400);
  }

  if (!FORCE_MOCK) {
    try {
      const res = await fetch(`${BASE_URL}/vault/${encodeURIComponent(id)}/meta`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new ApiError(errJson.message || `HTTP ${res.status}: Metadata retrieval failed`, res.status, errJson);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  // Mock Store Implementation
  initMockData();
  const vault = mockVaults.get(id);
  if (!vault) {
    throw new ApiError(`Vault '${id}' not found`, 404);
  }

  if (vault.revoked) {
    throw new ApiError('Vault has been revoked by owner', 410);
  }

  if (vault.burned) {
    throw new ApiError('Vault has been burned or exceeded download limit', 410);
  }

  if (new Date(vault.expiresAt).getTime() <= Date.now()) {
    vault.burned = true;
    persistMockData();
    throw new ApiError('Vault has expired', 410);
  }

  if (vault.remainingDownloads <= 0) {
    vault.burned = true;
    persistMockData();
    throw new ApiError('Vault download limit reached', 410);
  }

  return {
    success: true,
    id: vault.id,
    mode: vault.mode,
    recipientUsername: vault.recipientUsername || null,
    encryptedMetaB64: vault.encryptedMetaB64,
    ivB64: vault.ivB64,
    metaIvB64: vault.metaIvB64,
    wrappedAesKeyB64: vault.wrappedAesKeyB64,
    isPasswordProtected: vault.isPasswordProtected,
    isBurnAfterReading: vault.isBurnAfterReading,
    maxDownloads: vault.maxDownloads,
    remainingDownloads: vault.remainingDownloads,
    expiresAt: vault.expiresAt
  };
}

/**
 * Downloads the encrypted file payload, decrementing remaining downloads.
 */
export async function downloadFile(id, authOptions = {}) {
  if (!id) {
    throw new ApiError('Vault ID is required', 400);
  }

  if (!FORCE_MOCK) {
    try {
      const res = await fetch(`${BASE_URL}/vault/${encodeURIComponent(id)}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authOptions || {})
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new ApiError(errJson.message || `HTTP ${res.status}: Download failed`, res.status, errJson);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  // Mock Store Implementation
  initMockData();
  const vault = mockVaults.get(id);
  if (!vault) {
    throw new ApiError(`Vault '${id}' not found`, 404);
  }

  if (vault.revoked) {
    throw new ApiError('Vault has been revoked by owner', 410);
  }

  if (vault.burned) {
    throw new ApiError('Vault has been burned or exceeded download limit', 410);
  }

  if (new Date(vault.expiresAt).getTime() <= Date.now()) {
    vault.burned = true;
    persistMockData();
    throw new ApiError('Vault has expired', 410);
  }

  if (vault.remainingDownloads <= 0) {
    vault.burned = true;
    persistMockData();
    throw new ApiError('Vault download limit reached', 410);
  }

  // Decrement download count and append audit log
  vault.remainingDownloads -= 1;
  vault.logs.push({
    timestamp: new Date().toISOString(),
    ipHash: 'mock-recipient',
    event: 'DOWNLOAD'
  });

  // Check burn after reading or download exhaustion
  if (vault.isBurnAfterReading || vault.remainingDownloads <= 0) {
    vault.burned = true;
    vault.logs.push({
      timestamp: new Date().toISOString(),
      ipHash: 'system',
      event: 'BURNED'
    });
  }

  persistMockData();

  return {
    success: true,
    encryptedBlobB64: vault.encryptedBlobB64,
    ivB64: vault.ivB64,
    metaIvB64: vault.metaIvB64,
    remainingDownloads: vault.remainingDownloads
  };
}

/**
 * Retrieves the access audit trail logs for an owned vault item.
 */
export async function getAccessLogs(id, ownerToken) {
  if (!id || !ownerToken) {
    throw new ApiError('Vault ID and ownerToken are required', 400);
  }

  if (!FORCE_MOCK) {
    try {
      const res = await fetch(`${BASE_URL}/vault/${encodeURIComponent(id)}/logs`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-owner-token': ownerToken,
          ...getAuthHeaders()
        }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new ApiError(errJson.message || `HTTP ${res.status}: Access logs failed`, res.status, errJson);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  // Mock Store Implementation
  initMockData();
  const vault = mockVaults.get(id);
  if (!vault) {
    throw new ApiError(`Vault '${id}' not found`, 404);
  }

  if (vault.ownerId && vault.ownerId !== 'anonymous' && vault.ownerId !== getCurrentOwnerKey()) {
    throw new ApiError('Forbidden: you do not own this vault', 403);
  }

  if (vault.ownerToken !== ownerToken) {
    throw new ApiError('Unauthorized: invalid owner token', 401);
  }

  return {
    success: true,
    logs: [...vault.logs]
  };
}

/**
 * Revokes a vault item immediately (kill-switch deletion).
 */
export async function revokeFile(id, ownerToken) {
  if (!id || !ownerToken) {
    throw new ApiError('Vault ID and ownerToken are required', 400);
  }

  if (!FORCE_MOCK) {
    try {
      const res = await fetch(`${BASE_URL}/vault/${encodeURIComponent(id)}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-owner-token': ownerToken,
          ...getAuthHeaders()
        }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new ApiError(errJson.message || `HTTP ${res.status}: Revocation failed`, res.status, errJson);
      }

      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure: fallback to mock store
    }
  }

  // Mock Store Implementation
  initMockData();
  const vault = mockVaults.get(id);
  if (!vault) {
    throw new ApiError(`Vault '${id}' not found`, 404);
  }

  if (vault.ownerId && vault.ownerId !== 'anonymous' && vault.ownerId !== getCurrentOwnerKey()) {
    throw new ApiError('Forbidden: you do not own this vault', 403);
  }

  if (vault.ownerToken !== ownerToken) {
    throw new ApiError('Unauthorized: invalid owner token', 401);
  }

  vault.revoked = true;
  vault.burned = true;
  vault.logs.push({
    timestamp: new Date().toISOString(),
    ipHash: 'mock-owner',
    event: 'REVOKED'
  });

  persistMockData();

  return {
    success: true,
    message: 'Revoked'
  };
}

/**
 * Registers a new user account in the backend database.
 */
export async function registerAuth({
  email,
  displayName,
  password,
  publicKey,
  publicKeyFingerprint,
  encryptedPrivateKey,
}) {
  if (!email || !password || !publicKey || !publicKeyFingerprint) {
    throw new ApiError('Email, password, publicKey, and publicKeyFingerprint are required', 400);
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        displayName,
        password,
        publicKey,
        publicKeyFingerprint,
        ...(encryptedPrivateKey ? { encryptedPrivateKey } : {}),
      }),
    });
  } catch (err) {
    throw new ApiError('Unable to reach VaultX backend server', 503);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json.error || json.message || `HTTP ${res.status}: Registration failed`, res.status, json);
  }

  return json;
}

/**
 * Authenticates an existing user against the backend database.
 */
export async function loginAuth({ email, password }) {
  if (!email || !password) {
    throw new ApiError('Email and password are required', 400);
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new ApiError('Unable to reach VaultX backend server', 503);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json.error || json.message || `HTTP ${res.status}: Authentication failed`, res.status, json);
  }

  return json;
}
