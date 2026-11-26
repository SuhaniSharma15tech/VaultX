'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * VaultX Mock Auth Context
 * Provides lightweight demo authentication state across the app.
 * Persists session to localStorage so it survives page reloads.
 */

const STORAGE_KEY = 'vaultx_auth_session';

// Pre-seeded demo accounts for mock login
const MOCK_ACCOUNTS = [
  { email: 'admin@vaultx.io', password: 'admin123', name: 'Admin' },
  { email: 'alice@vaultx.io', password: 'alice123', name: 'Alice' },
  { email: 'demo@vaultx.io', password: 'demo1234', name: 'Demo User' },
];

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
   * Mock sign-in.
   * Accepts any email/password matching MOCK_ACCOUNTS, or any email with
   * password "vaultx" as a universal demo backdoor.
   * Returns { success, user? , error? }
   */
  const signIn = useCallback(async ({ email, password, remember = false }) => {
    // Simulate network latency
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));

    const normalEmail = email.trim().toLowerCase();

    const matched = MOCK_ACCOUNTS.find(
      (a) => a.email === normalEmail && a.password === password
    );

    // Universal demo password
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
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut, continueAsGuest }}>
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
