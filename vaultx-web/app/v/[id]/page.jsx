'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { DecryptView } from '../../../components/DecryptView.jsx';
import { ThemeToggle } from '../../../components/ThemeToggle.jsx';
import { VaultXLogo } from '../../../components/VaultXLogo.jsx';

/**
 * RecipientDecryptPage (/v/[id])
 * Client component dynamic route resolving the vault ID parameter safely
 * and mounting <DecryptView fileId={id} />.
 */
export default function RecipientDecryptPage({ params }) {
  const routeParams = useParams();
  const [resolvedId, setResolvedId] = useState(() => {
    if (params && typeof params.then !== 'function' && params.id) {
      return Array.isArray(params.id) ? params.id[0] : params.id;
    }
    if (routeParams?.id) {
      return Array.isArray(routeParams.id) ? routeParams.id[0] : routeParams.id;
    }
    return '';
  });

  useEffect(() => {
    let cancelled = false;
    if (params && typeof params.then === 'function') {
      params.then((p) => {
        if (!cancelled && p?.id) {
          setResolvedId(Array.isArray(p.id) ? p.id[0] : p.id);
        }
      });
    } else if (routeParams?.id && !resolvedId) {
      setResolvedId(Array.isArray(routeParams.id) ? routeParams.id[0] : routeParams.id);
    }
    return () => {
      cancelled = true;
    };
  }, [params, routeParams, resolvedId]);

  const fileId =
    resolvedId ||
    (routeParams?.id ? (Array.isArray(routeParams.id) ? routeParams.id[0] : routeParams.id) : '');

  return (
    <div className="relative min-h-screen text-zinc-900 dark:text-[#FAFAFA] transition-colors duration-150">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 dark:border-white/10 dark:bg-[#050508]/85 backdrop-blur-xl transition-colors duration-150">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <VaultXLogo className="h-8 w-8" />
            <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-[#FAFAFA]">
              VAULTX
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 font-mono text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-zinc-500 dark:text-[#A1A1AA]" />
              <span>New Upload</span>
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 font-mono text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/10"
            >
              <LayoutDashboard className="h-3.5 w-3.5 text-zinc-500 dark:text-[#A1A1AA]" />
              <span>Dashboard</span>
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-4 py-8">
        {fileId ? (
          <DecryptView fileId={fileId} />
        ) : (
          <div className="hud-glass rounded-xl border border-white/10 p-6 font-mono text-sm text-[#A1A1AA]">
            Resolving vault identifier...
          </div>
        )}
      </main>
    </div>
  );
}
