'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { registerAuth, loginAuth } from './api.js';
import { generateUserKeyPair } from './vaultCrypto.js';
import { storeUserKey } from './keyStore.js';

/**
 * VaultX Auth Context
 * Authenticates against the backend (/api/auth/register, /api/auth/login)
 * and persists the session to localStorage.
 * Falls back to local demo accounts only when NEXT_PUBLIC_MOCK_BACKEND === 'true'.
 */

const STORAGE_KEY = 'vaultx_auth_session';
const USERS_STORAGE_KEY = 'vaultx_registered_users';
const FORCE_MOCK = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_MOCK_BACKEND === 'true';

// Pre-seeded demo accounts for mock login
const MOCK_ACCOUNTS = [
  { email: 'admin@vaultx.io', password: 'admin123', name: 'Admin' },
  { email: 'alice@vaultx.io', password: 'alice123', name: 'Alice' },
  { email: 'demo@vaultx.io', password: 'demo1234', name: 'Demo User' },
];

function getRegisteredUsers() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(USERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // initial hydration

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.email) {
            setUser(parsed);
          }
        }
      } catch (_) {}
    }
    setIsLoading(false);
  }, []);

  /**
   * Sign-in via backend /api/auth/login (or mock accounts when FORCE_MOCK is enabled).
   * Returns { success, user?, error? }
   */
  const signIn = useCallback(async ({ email, password, remember = false }) => {
    const normalEmail = email.trim().toLowerCase();

    if (FORCE_MOCK) {
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));
      const allAccounts = [...MOCK_ACCOUNTS, ...getRegisteredUsers()];
      const matched = allAccounts.find(
        (a) => a.email === normalEmail && a.password === password
      );
      const isUniversal = password === 'vaultx';

      if (!matched && !isUniversal) {
        return { success: false, error: 'Invalid email or password. Try demo@vaultx.io / demo1234' };
      }

      const session = {
        email: normalEmail,
        name: matched?.name || normalEmail.split('@')[0],
        loginAt: new Date().toISOString(),
        remember,
      };
      setUser(session);
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch (_) {}
      }
      return { success: true, user: session };
    }

    try {
      const data = await loginAuth({ email: normalEmail, password });
      const session = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.displayName || data.user.email.split('@')[0],
        publicKey: data.user.publicKey,
        publicKeyFingerprint: data.user.publicKeyFingerprint,
        token: data.token,
        loginAt: new Date().toISOString(),
        remember,
      };

      setUser(session);
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch (_) {}
      }

      return { success: true, user: session };
    } catch (err) {
      return { success: false, error: err?.message || 'Invalid email or password' };
    }
  }, []);

  /**
   * Sign-up via backend /api/auth/register (or localStorage when FORCE_MOCK is enabled).
   * Generates the user's RSA-OAEP keypair, registers in Supabase DB, and signs in.
   */
  const signUp = useCallback(async ({ name, email, password }) => {
    const cleanName = name.trim();
    const normalEmail = email.trim().toLowerCase();

    if (FORCE_MOCK) {
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
      const existing = [...MOCK_ACCOUNTS, ...getRegisteredUsers()].find(
        (a) => a.email === normalEmail
      );
      if (existing) {
        return { success: false, error: 'An account with this email already exists.' };
      }

      const newAccount = { name: cleanName, email: normalEmail, password };
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const updatedUsers = [...getRegisteredUsers(), newAccount];
          window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
        } catch (_) {}
      }

      const session = {
        email: normalEmail,
        name: cleanName,
        loginAt: new Date().toISOString(),
        remember: true,
      };
      setUser(session);
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch (_) {}
      }
      return { success: true, user: session };
    }

    try {
      const { keyPair, publicKeyPem, keyFingerprint } = await generateUserKeyPair();
      const data = await registerAuth({
        email: normalEmail,
        displayName: cleanName || undefined,
        password,
        publicKey: publicKeyPem,
        publicKeyFingerprint: keyFingerprint,
      });

      await storeUserKey(normalEmail, keyPair, publicKeyPem, keyFingerprint).catch(() => {});

      const session = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.displayName || cleanName || data.user.email.split('@')[0],
        publicKey: data.user.publicKey,
        publicKeyFingerprint: data.user.publicKeyFingerprint,
        token: data.token,
        loginAt: new Date().toISOString(),
        remember: true,
      };

      setUser(session);
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch (_) {}
      }

      return { success: true, user: session };
    } catch (err) {
      return { success: false, error: err?.message || 'Registration failed' };
    }
  }, []);

  /**
   * Guest access — no credentials needed.
   */
  const continueAsGuest = useCallback(() => {
    const session = {
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
