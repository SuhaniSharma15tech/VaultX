'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { webLogin, webRegister } from './api.js';
import { generateUserKeyPair } from './vaultCrypto.js';
import { storeUserKey, getUserKey } from './keyStore.js';

/**
 * VaultX Auth Context
 * Connects to backend auth endpoints with offline mock fallback.
 * Automatically generates a unique username and non-extractable RSA-OAEP
 * keypair on registration, persists keys in IndexedDB across sessions,
 * and isolates per-user cached state.
 */

const STORAGE_KEY = 'vaultx_auth_session';
const ACTIVE_USERNAME_KEY = 'vaultx_active_username';

export function generateUniqueUsername(nameOrEmail) {
  const base = String(nameOrEmail || 'user')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 14) || 'user';

  const bytes = new Uint8Array(3);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const suffix = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${base}_${suffix}`;
}

export function getUserVaultStorageKey(session) {
  if (!session) return 'vaultx_sent_vaults';
  const ownerKey = session.id || session.email || 'guest';
  return `vaultx_sent_vaults_${ownerKey}`;
}

function clearLegacyUnscopedCaches() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem('vaultx_sent_vaults');
    window.localStorage.removeItem('vaultx_history');
  } catch (_) {}
}

function syncActiveUsername(username) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (username) {
      window.localStorage.setItem(ACTIVE_USERNAME_KEY, username);
    } else {
      window.localStorage.removeItem(ACTIVE_USERNAME_KEY);
    }
  } catch (_) {}
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.email) {
            setUser(parsed);
            if (parsed.username) {
              syncActiveUsername(parsed.username);
            }
          }
        }
      } catch (_) {}
    }
    setIsLoading(false);
  }, []);

  const signIn = useCallback(async ({ email, password, remember = false }) => {
    try {
      const res = await webLogin({ email, password });
      const username = res.user.username || null;

      // Never regenerate keys on login — restore existing key metadata if present
      let fingerprint = res.user.fingerprint || null;
      if (username) {
        try {
          const existingKey = await getUserKey(username);
          if (existingKey?.fingerprint) {
            fingerprint = existingKey.fingerprint;
          }
        } catch (_) {}
      }

      const session = {
        id: res.user.id,
        username,
        email: res.user.email,
        name: res.user.name,
        fingerprint,
        token: res.token || null,
        loginAt: new Date().toISOString(),
        remember,
      };

      clearLegacyUnscopedCaches();
      syncActiveUsername(username);
      setUser(session);

      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch (_) {}
      }

      return { success: true, user: session };
    } catch (err) {
      const code = err?.data?.code || (err?.status === 404 ? 'USER_NOT_FOUND' : 'AUTH_ERROR');
      return {
        success: false,
        code,
        error: err.message || 'Authentication failed',
      };
    }
  }, []);

  const signUp = useCallback(async ({ name, email, password }) => {
    try {
      // 1. Auto-generate unique username + non-extractable RSA-OAEP keypair client-side
      const username = generateUniqueUsername(name || email);
      const { keyPair, publicKeyPem, keyFingerprint } = await generateUserKeyPair();

      // 2. Register user + public key with backend (private key never leaves client)
      const res = await webRegister({
        name,
        email,
        password,
        username,
        publicKeyPem,
        fingerprint: keyFingerprint,
      });

      const finalUsername = res.user.username || username;

      // 3. Persist non-extractable private key + public key in client IndexedDB
      await storeUserKey(finalUsername, keyPair, publicKeyPem, keyFingerprint);

      const session = {
        id: res.user.id,
        username: finalUsername,
        email: res.user.email,
        name: res.user.name,
        fingerprint: keyFingerprint,
        token: res.token || null,
        loginAt: new Date().toISOString(),
        remember: true,
      };

      clearLegacyUnscopedCaches();
      syncActiveUsername(finalUsername);
      setUser(session);

      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch (_) {}
      }

      return { success: true, user: session };
    } catch (err) {
      return {
        success: false,
        code: err?.data?.code || 'REGISTER_ERROR',
        error: err.message || 'Registration failed',
      };
    }
  }, []);

  const continueAsGuest = useCallback(() => {
    clearLegacyUnscopedCaches();
    syncActiveUsername(null);
    const session = {
      id: 'guest',
      email: 'guest',
      name: 'Guest',
      isGuest: true,
      loginAt: new Date().toISOString(),
    };
    setUser(session);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch (_) {}
    }
  }, []);

  const signOut = useCallback(() => {
    clearLegacyUnscopedCaches();
    syncActiveUsername(null);
    setUser(null);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut, continueAsGuest }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}

export default AuthContext;
