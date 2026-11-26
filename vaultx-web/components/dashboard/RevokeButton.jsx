'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Check, AlertCircle, ShieldAlert, X, Loader2 } from 'lucide-react';
import { revokeFile } from '../../lib/api.js';

/**
 * RevokeButton : Tactical Crimson kill-switch button with:
 *   • Two-step confirmation modal to prevent accidental revocation
 *   • Loading spinner during API call
 *   • Success state with emerald check
 *   • Error display with dismiss
 *   • Disabled state when already revoked
 */
export function RevokeButton({
  fileId,
  ownerToken,
  disabled = false,
  isRevoked = false,
  onRevoked,
  onRevoke,
}) {
  const [status, setStatus] = useState(isRevoked ? 'revoked' : 'idle');
  const [error, setError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Open confirmation modal ────────────────────────────────────
  const handleClick = useCallback(() => {
    if (disabled || status === 'revoking' || status === 'revoked' || isRevoked) return;

    // If no fileId/ownerToken (mock mode), fire callback directly
    if (!fileId || !ownerToken) {
      if (onRevoke) onRevoke();
      return;
    }

    // Show confirmation modal
    setShowConfirm(true);
  }, [disabled, status, fileId, ownerToken, onRevoke, isRevoked]);

  // ── Execute revocation ─────────────────────────────────────────
  const executeRevoke = useCallback(async () => {
    setShowConfirm(false);
    setStatus('revoking');
    setError(null);

    try {
      const res = await revokeFile(fileId, ownerToken);
      setStatus('revoked');
      if (onRevoked) onRevoked(res);
      if (onRevoke) onRevoke(res);
    } catch (err) {
      setError(err.message || 'Revocation failed');
      setStatus('error');
    }
  }, [fileId, ownerToken, onRevoked, onRevoke]);

  const cancelRevoke = useCallback(() => {
    setShowConfirm(false);
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
    setStatus('idle');
  }, []);

  const isDisabled = disabled || status === 'revoking' || status === 'revoked' || isRevoked;

  return (
    <>
      <div className="inline-flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={handleClick}
          disabled={isDisabled}
          className={`btn-revoke inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs font-semibold transition-all ${status === 'revoked' || isRevoked
            ? 'border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-emerald-500/40 dark:bg-emerald-950/25 dark:text-emerald-400 cursor-not-allowed shadow-none dark:shadow-[0_0_12px_rgba(16,185,129,0.15)]'
            : status === 'revoking'
              ? 'border-zinc-400 bg-zinc-200 text-zinc-700 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-300 opacity-75 cursor-wait'
              : 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-red-500/50 dark:bg-gradient-to-r dark:from-red-950/40 dark:to-red-900/30 dark:text-red-300 dark:hover:from-red-950/60 dark:hover:to-red-900/50 dark:hover:border-red-500/70 shadow-sm disabled:opacity-50'
            }`}
        >
          {status === 'revoked' || isRevoked ? (
            <>
              <Check className="h-3.5 w-3.5 text-zinc-600 dark:text-emerald-400" />
              <span>Revoked</span>
            </>
          ) : status === 'revoking' ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-600 dark:text-red-400" />
              <span>Revoking...</span>
            </>
          ) : (
            <>
              <Trash2 className="h-3.5 w-3.5 text-zinc-200 dark:text-red-400" />
              <span>Revoke Access</span>
            </>
          )}
        </button>

        {error && (
          <div className="inline-flex items-center gap-1 font-mono text-[11px] text-red-400">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={dismissError}
              className="ml-1 rounded p-0.5 hover:bg-red-500/10"
              title="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Modal : Rendered via Portal directly to body to avoid CSS backdrop-filter / overflow containment */}
      {showConfirm && mounted && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/85 backdrop-blur-sm"
            onClick={cancelRevoke}
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-zinc-300 bg-white p-6 shadow-2xl dark:border-red-500/40 dark:bg-[#0B0C10] dark:shadow-red-950/60">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              <ShieldAlert className="h-6 w-6" />
            </div>

            <h3 className="mb-1 text-center font-mono text-sm font-bold text-zinc-900 dark:text-[#FAFAFA]">
              Revoke Access?
            </h3>
            <p className="mb-5 text-center text-xs text-zinc-600 dark:text-[#A1A1AA] leading-relaxed">
              This will <strong className="text-zinc-900 dark:text-red-400">permanently wipe</strong> the key envelope and purge the ciphertext blob. Recipients will immediately receive <code className="rounded bg-zinc-200 px-1 py-0.5 text-zinc-900 dark:bg-red-950/60 dark:text-red-300 font-mono">410 Gone</code>.
            </p>

            <div className="mb-5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-center font-mono text-[11px] text-zinc-500 dark:border-white/10 dark:bg-[#07080B] dark:text-[#71717A]">
              Vault ID: <span className="text-zinc-900 font-semibold dark:text-zinc-200">{fileId}</span>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={cancelRevoke}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 font-mono text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeRevoke}
                className="flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 font-mono text-xs font-bold text-white transition-all hover:bg-black dark:border dark:border-red-500/50 dark:bg-gradient-to-r dark:from-red-600/40 dark:to-red-900/50 dark:text-red-200 dark:hover:bg-red-500/40 shadow-lg"
              >
                Yes, Revoke
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default RevokeButton;
