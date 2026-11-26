'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { webLogin, webRegister } from './api.js';

/**
 * VaultX Auth Context
 * Connects to backend auth endpoints with offline mock fallback.
 * Persists session to localStorage and isolates per-user cached state.
 */

const STORAGE_KEY = 'vaultx_auth_session';

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
          }
        }
      } catch (_) {}
    }
    setIsLoading(false);
  }, []);

  const signIn = useCallback(async ({ email, password, remember = false }) => {
    try {
      const res = await webLogin({ email, password });
      const session = {
        id: res.user.id,
        email: res.user.email,
        name: res.user.name,
        token: res.token || null,
        loginAt: new Date().toISOString(),
        remember,
      };

      clearLegacyUnscopedCaches();
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
      const res = await webRegister({ name, email, password });
      const session = {
        id: res.user.id,
        email: res.user.email,
        name: res.user.name,
        token: res.token || null,
        loginAt: new Date().toISOString(),
        remember: true,
      };

      clearLegacyUnscopedCaches();
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
