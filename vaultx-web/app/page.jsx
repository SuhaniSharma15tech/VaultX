'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shield, Key, LayoutDashboard, LogIn, Lock } from 'lucide-react';
import { UploadCard } from '../components/UploadCard.jsx';
import { KeySetupModal } from '../components/KeySetupModal.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { AuthNavButton } from '../components/AuthNavButton.jsx';
import { useAuth } from '../lib/authContext.js';

/**
 * HomePage (/)
 * VaultX client-side encrypted zero-knowledge upload and sharing route.
 * Dual-theme:
 * - Dark: Pitch-black, Cyber Green, Tactical Crimson
 * - Light: Pure White, Minimalist Charcoal, Slate, Black
 */
export default function HomePage() {
  const { user, isLoading } = useAuth();
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [activeKeyInfo, setActiveKeyInfo] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const savedUser = window.localStorage.getItem('vaultx_active_username');
        if (savedUser) {
          setActiveKeyInfo({ username: savedUser });
        }
      } catch (_) { }
    }
  }, []);

  return (
    <div className="relative min-h-screen text-zinc-900 dark:text-[#FAFAFA] transition-colors duration-150">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 dark:border-white/10 dark:bg-[#050508]/85 backdrop-blur-xl transition-colors duration-150">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-900 bg-zinc-900 text-white dark:border-red-500/40 dark:bg-red-500/10 dark:text-[#EF4444] transition-colors group-hover:opacity-90">
              <Shield className="h-4 w-4" />
            </div>
            <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-[#FAFAFA]">
              VAULTX
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsKeyModalOpen(true)}
              className="btn-open-key-setup inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/10"
            >
              <Key className="h-3.5 w-3.5 text-zinc-500 dark:text-[#A1A1AA]" />
              <span>
                {activeKeyInfo?.username ? `ID: ${activeKeyInfo.username}` : 'Key Setup'}
              </span>
            </button>

            <Link
              href="/dashboard"
              className="nav-dashboard-link inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/10"
            >
              <LayoutDashboard className="h-3.5 w-3.5 text-zinc-500 dark:text-[#A1A1AA]" />
              <span>Dashboard</span>
            </Link>

            <AuthNavButton variant="primary" />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-4 pt-8 pb-6">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#FAFAFA] sm:text-3xl">
            Zero-Knowledge File &amp; Secret Sharing
          </h1>
          <p className="mt-1.5 text-sm text-zinc-600 dark:text-[#A1A1AA]">
            Client-side AES-256-GCM encryption in your browser. Keys stay in URL{' '}
            <code className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              #fragments
            </code>{' '}
            or RSA-OAEP wraps.
          </p>
        </div>

        <div className="relative">
          <div className="animate-float-slow pointer-events-none absolute -left-52 top-10 hidden w-44 rounded-xl border border-zinc-200 bg-white/95 p-3.5 backdrop-blur-xl shadow-xl shadow-zinc-900/5 dark:border-white/10 dark:bg-[#0B0C10]/90 dark:shadow-[0_20px_50px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] xl:block">
            <div className="mb-2 flex items-center justify-between border-b border-zinc-200 pb-1.5 font-mono text-[10px] text-zinc-500 dark:border-white/10 dark:text-[#71717A]">
              <span>CLIENT_ISOLATION</span>
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-800 dark:bg-[#10B981] dark:shadow-[0_0_8px_#10B981]" />
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-[#71717A]">SERVER_BLIND:</span>
                <span className="text-zinc-900 dark:text-[#FAFAFA]">TRUE</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-[#71717A]">IV_NONCE:</span>
                <span className="text-zinc-600 dark:text-[#A1A1AA]">12-BYTE</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-[#71717A]">KEY_EXIT:</span>
                <span className="text-zinc-900 font-bold dark:text-red-400">BLOCKED</span>
              </div>
            </div>
          </div>

          <div
            className="animate-float-slow pointer-events-none absolute -right-52 bottom-12 hidden w-44 rounded-xl border border-zinc-200 bg-white/95 p-3.5 backdrop-blur-xl shadow-xl shadow-zinc-900/5 dark:border-white/10 dark:bg-[#0B0C10]/90 dark:shadow-[0_20px_50px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] xl:block"
            style={{ animationDelay: '-2.8s' }}
          >
            <div className="mb-2 flex items-center justify-between border-b border-zinc-200 pb-1.5 font-mono text-[10px] text-zinc-500 dark:border-white/10 dark:text-[#71717A]">
              <span>CRYPTO_TELEMETRY</span>
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-800 dark:bg-[#EF4444]" />
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-[#71717A]">CIPHER:</span>
                <span className="text-zinc-900 dark:text-[#FAFAFA]">AES-256</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-[#71717A]">DIGEST:</span>
                <span className="text-zinc-600 dark:text-[#A1A1AA]">SHA-256</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-[#71717A]">LEAKS:</span>
                <span className="text-zinc-900 dark:text-[#FAFAFA]">0</span>
              </div>
            </div>
          </div>

          {/* Auth Gate: Senders must have an account */}
          {isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-zinc-200 bg-white/80 p-8 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0C10]/90">
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent dark:border-red-500 dark:border-t-transparent" />
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">Verifying session...</span>
              </div>
            </div>
          ) : !user ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white/95 p-8 text-center shadow-xl shadow-zinc-900/5 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0C10]/95 dark:shadow-[0_20px_50px_rgba(0,0,0,0.85)] sm:p-10">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-900 bg-zinc-900 text-white dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400">
                <Lock className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
                Account Required to Share
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                To encrypt, upload, and dispatch secure vaults, senders must be signed into a verified VaultX account.
                Recipients do not need an account to decrypt or download.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-900 bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 dark:border-emerald-500/30 dark:bg-[#10B981] dark:shadow-lg dark:shadow-emerald-500/25 dark:hover:bg-[#059669] sm:w-auto"
                >
                  <LogIn className="h-4 w-4" />
                  <span>Sign In to Send Files</span>
                </Link>
              </div>
              <div className="mt-6 border-t border-zinc-200 pt-4 font-mono text-[11px] text-zinc-500 dark:border-white/10 dark:text-zinc-500">
                Are you a recipient? Just paste or open the full link with key fragment.
              </div>
            </div>
          ) : (
            <UploadCard />
          )}
        </div>
      </main>

      <KeySetupModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        initialUsername={activeKeyInfo?.username || ''}
        onKeyGenerated={(info) => setActiveKeyInfo(info)}
      />
    </div>
  );
}
