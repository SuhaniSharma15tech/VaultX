'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ExternalLink, RefreshCw, Inbox, Lock, LogIn, AlertCircle } from 'lucide-react';
import { AuditTrail } from '../../components/dashboard/AuditTrail.jsx';
import { HexInspector } from '../../components/dashboard/HexInspector.jsx';
import { RevokeButton } from '../../components/dashboard/RevokeButton.jsx';
import { TerminalWindow } from '../../components/TerminalWindow.jsx';
import { ThemeToggle } from '../../components/ThemeToggle.jsx';
import { AuthNavButton } from '../../components/AuthNavButton.jsx';
import { VaultXLogo } from '../../components/VaultXLogo.jsx';
import { useAuth, getUserVaultStorageKey } from '../../lib/authContext.js';
import { getMetadata, getMyVaults } from '../../lib/api.js';

/**
 * DashboardPage (/dashboard)
 * Sender dashboard reading sent vaults from localStorage ('vaultx_sent_vaults')
 * and hosting Person 4 components: <AuditTrail />, <HexInspector />, and <RevokeButton />.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [sentVaults, setSentVaults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [inspectedMetaB64, setInspectedMetaB64] = useState('');
  const [inspectedIv, setInspectedIv] = useState('');
  const [inspectStatus, setInspectStatus] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');

  const activeUserKey = user ? (user.id || user.email || 'guest') : null;

  const loadVaults = useCallback(async () => {
    if (!user) {
      setSentVaults([]);
      setSelectedId(null);
      return;
    }

    setIsRefreshing(true);
    setRefreshError('');

    try {
      const res = await getMyVaults();
      const apiVaults = Array.isArray(res?.vaults) ? res.vaults : [];

      let localList = [];
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const storageKey = getUserVaultStorageKey(user);
          const raw = window.localStorage.getItem(storageKey);
          const parsed = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) {
            localList = parsed.filter(
              (item) => !item.ownerId || item.ownerId === activeUserKey
            );
          }
        } catch (_) {}
      }

      const localById = new Map(
        localList.map((item) => [item.fileId || item.id, item])
      );

      let merged;
      if (apiVaults.length > 0) {
        merged = apiVaults.map((v) => {
          const localMatch = localById.get(v.fileId || v.id);
          return {
            ...v,
            filename: localMatch?.filename || v.filename || `Vault ${(v.fileId || v.id).slice(0, 8)}`,
          };
        });
      } else {
        merged = localList;
      }

      setSentVaults(merged);
      setSelectedId((prev) => {
        if (prev && merged.some((v) => (v.fileId || v.id) === prev)) return prev;
        return merged.length > 0 ? (merged[0].fileId || merged[0].id) : null;
      });
    } catch (err) {
      setRefreshError(err.message || 'Failed to refresh vaults. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, [user, activeUserKey]);

  // Redirect unauthenticated senders to login and clear stale state on account switch/logout
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setSentVaults([]);
      setSelectedId(null);
      setInspectedMetaB64('');
      setInspectedIv('');
      setInspectStatus('');
      setRefreshError('');
      router.push('/login');
      return;
    }
    setSentVaults([]);
    setSelectedId(null);
    setInspectedMetaB64('');
    setInspectedIv('');
    setInspectStatus('');
    loadVaults();
  }, [isLoading, user, activeUserKey, router, loadVaults]);

  const selectedVault =
    sentVaults.find((v) => (v.fileId || v.id) === selectedId) || sentVaults[0] || null;
  const activeFileId = selectedVault?.fileId || selectedVault?.id || null;

  useEffect(() => {
    let cancelled = false;
    async function loadCipherMeta() {
      if (!activeFileId) {
        setInspectedMetaB64('');
        setInspectedIv('');
        setInspectStatus('');
        return;
      }
      setInspectStatus('Fetching encrypted metadata header...');
      try {
        const meta = await getMetadata(activeFileId);
        if (!cancelled && meta?.encryptedMetaB64) {
          setInspectedMetaB64(meta.encryptedMetaB64);
          setInspectedIv(meta.ivB64 || meta.iv || '');
          setInspectStatus('Encrypted metadata header loaded (0 downloads consumed)');
        }
      } catch (err) {
        if (!cancelled) {
          setInspectedMetaB64('');
          setInspectedIv('');
          setInspectStatus(err.message || 'Vault unavailable or expired/revoked');
        }
      }
    }
    loadCipherMeta();
    return () => {
      cancelled = true;
    };
  }, [activeFileId]);

  const handleRevoked = (fileId) => {
    setSentVaults((prev) => {
      const updated = prev.map((item) =>
        (item.fileId || item.id) === fileId ? { ...item, revoked: true } : item
      );
      if (typeof window !== 'undefined' && window.localStorage && user) {
        try {
          window.localStorage.setItem(getUserVaultStorageKey(user), JSON.stringify(updated));
        } catch (_) {}
      }
      return updated;
    });
    setInspectedMetaB64('');
    setInspectStatus('Vault has been revoked by owner');
  };

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
            <button
              type="button"
              onClick={loadVaults}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 font-mono text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/10"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-zinc-500 dark:text-[#A1A1AA] ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 text-white hover:bg-black shadow-md dark:bg-[#10B981] dark:shadow-emerald-500/25 dark:hover:bg-[#059669] px-3.5 py-1.5 font-mono text-xs font-semibold transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Vault</span>
            </Link>

            <AuthNavButton variant="outline" mono />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#FAFAFA]">Sent Vaults</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-[#A1A1AA]">
            Locally tracked uploads from this browser. Inspect access logs, raw ciphertext headers, or trigger instant kill-switch revocation.
          </p>
        </div>

        {refreshError && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{refreshError}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-zinc-200 bg-white/80 p-8 shadow-sm dark:border-white/10 dark:bg-[#07080B]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent dark:border-red-500 dark:border-t-transparent" />
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">Verifying session...</span>
            </div>
          </div>
        ) : !user ? (
          <div className="rounded-xl border border-zinc-200 bg-white/95 p-10 text-center shadow-lg dark:border-white/10 dark:bg-[#07080B]">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-900 bg-zinc-900 text-white dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400">
              <Lock className="h-6 w-6" />
            </div>
            <h3 className="font-mono text-base font-semibold text-zinc-900 dark:text-[#FAFAFA]">Sign In Required</h3>
            <p className="mx-auto mt-2 max-w-sm text-xs text-zinc-600 dark:text-[#71717A]">
              The sender dashboard and telemetry audit trail are available only to authenticated VaultX accounts.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-zinc-900 bg-zinc-900 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 dark:border-emerald-500/30 dark:bg-[#10B981] dark:shadow-emerald-500/25 dark:hover:bg-[#059669]"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In to Access Dashboard</span>
            </Link>
          </div>
        ) : sentVaults.length === 0 ? (
          <TerminalWindow>
            <div className="p-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[#07080B]">
                <Inbox className="h-6 w-6 text-[#A1A1AA]" />
              </div>
              <h3 className="font-mono text-sm font-semibold text-[#FAFAFA]">No Sent Vaults Found</h3>
              <p className="mt-1 text-xs text-[#71717A]">
                Encrypt and upload a file or secret note to track it here.
              </p>
              <Link
                href="/"
                className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[#10B981] px-4 py-2 font-mono text-xs font-semibold text-white shadow-lg shadow-emerald-500/25 hover:bg-[#059669]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create First Vault</span>
              </Link>
            </div>
          </TerminalWindow>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Sent Vaults List */}
            <aside className="lg:col-span-5 space-y-3">
              {sentVaults.map((item) => {
                const itemId = item.fileId || item.id;
                const isSelected = itemId === activeFileId;
                return (
                  <div
                    key={itemId}
                    onClick={() => setSelectedId(itemId)}
                    className={`vault-list-item cursor-pointer rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-blue-900 bg-blue-50/40 shadow-md shadow-blue-900/5 ring-1 ring-blue-950/20 dark:border-[#10B981] dark:bg-[#0B0C10]/90 dark:ring-0 dark:shadow-[0_0_20px_-5px_rgba(16,185,129,0.25)]'
                        : 'border-zinc-200 bg-white/80 hover:border-blue-800/40 hover:bg-blue-50/20 dark:border-white/10 dark:bg-[#0B0C10]/60 dark:hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold ${isSelected ? 'text-blue-950 dark:text-[#FAFAFA]' : 'text-zinc-900 dark:text-[#FAFAFA]'}`}>
                          {item.filename || 'Encrypted Payload'}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-[#71717A]">
                          ID: {itemId} &bull; {item.mode || 'MODE_B'}
                        </p>
                      </div>
                      {item.revoked && (
                        <span className="rounded border border-zinc-300 bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400">
                          REVOKED
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 dark:border-white/10 pt-2.5">
                      <Link
                        href={`/v/${itemId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 font-mono text-xs font-medium text-blue-900 hover:text-blue-950 hover:underline dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]"
                      >
                        <span>Open Route</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>

                      <div onClick={(e) => e.stopPropagation()}>
                        <RevokeButton
                          fileId={itemId}
                          ownerToken={item.ownerToken}
                          isRevoked={Boolean(item.revoked)}
                          onRevoked={() => handleRevoked(itemId)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </aside>

            {/* Detail Inspector Slots (AuditTrail + HexInspector) */}
            <section className="lg:col-span-7 space-y-5">
              {selectedVault && (
                <>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0B0C10]/80">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-blue-950 dark:text-[#FAFAFA]">
                          {selectedVault.filename || 'Selected Vault'}
                        </h3>
                        <p className="font-mono text-xs text-zinc-500 dark:text-[#71717A]">
                          Created:{' '}
                          {selectedVault.createdAt
                            ? new Date(selectedVault.createdAt).toLocaleString()
                            : '-'}
                        </p>
                      </div>
                      <RevokeButton
                        key={`revoke-${activeFileId}`}
                        fileId={activeFileId}
                        ownerToken={selectedVault.ownerToken}
                        isRevoked={Boolean(selectedVault.revoked)}
                        onRevoked={() => handleRevoked(activeFileId)}
                      />
                    </div>
                  </div>

                  <AuditTrail
                    key={`audit-${activeFileId}`}
                    fileId={activeFileId}
                    ownerToken={selectedVault.ownerToken}
                  />

                  <div className="space-y-2">
                    <HexInspector
                      fileId={activeFileId}
                      encryptedBlobB64={inspectedMetaB64}
                      ivB64={inspectedIv}
                      label="Encrypted Metadata Header (Hex/ASCII)"
                    />
                    {inspectStatus && (
                      <p className="font-mono text-[11px] text-[#71717A]">{inspectStatus}</p>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
