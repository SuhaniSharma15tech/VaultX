'use client';

import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, X, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { generateUserKeyPair } from '../lib/vaultCrypto.js';
import { storeUserKey, getUserKey } from '../lib/keyStore.js';
import { registerUser } from '../lib/api.js';

/**
 * KeySetupModal
 * Onboarding modal for Mode A (RSA-OAEP 2048-bit) styled in matte charcoal (#0B0C10).
 */
export function KeySetupModal({ isOpen, onClose, onKeyGenerated, initialUsername = '' }) {
  const [username, setUsername] = useState(initialUsername);
  const [status, setStatus] = useState('idle');
  const [fingerprint, setFingerprint] = useState('');
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [registrationStatus, setRegistrationStatus] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    async function loadExisting() {
      const savedName =
        initialUsername ||
        (typeof window !== 'undefined' && window.localStorage?.getItem('vaultx_active_username')) ||
        '';
      if (savedName) {
        setUsername(savedName);
        try {
          const existing = await getUserKey(savedName);
          if (!cancelled && existing) {
            setFingerprint(existing.fingerprint || '');
            setPublicKeyPem(existing.publicKeyPem || '');
            setRegistrationStatus('Loaded existing keypair from local KeyStore');
            setStatus('ready');
          }
        } catch (_) { }
      }
    }

    loadExisting();
    return () => {
      cancelled = true;
    };
  }, [isOpen, initialUsername]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGenerateAndRegister = async (e) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError('Please enter a username before generating a keypair.');
      setStatus('error');
      return;
    }

    setStatus('generating');
    setError(null);
    setRegistrationStatus('Generating 2048-bit RSA-OAEP keypair...');

    try {
      const { keyPair, publicKeyPem: pem, keyFingerprint } = await generateUserKeyPair();

      await storeUserKey(cleanUsername, keyPair, pem, keyFingerprint);

      let apiStatusMsg = 'Stored locally and registered with directory';
      try {
        await registerUser({
          username: cleanUsername,
          publicKeyPem: pem,
          fingerprint: keyFingerprint,
        });
      } catch (regErr) {
        if (regErr?.status === 409) {
          apiStatusMsg = 'Stored locally (username already registered on server)';
        } else {
          throw regErr;
        }
      }

      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem('vaultx_active_username', cleanUsername);
        } catch (_) { }
      }

      setFingerprint(keyFingerprint);
      setPublicKeyPem(pem);
      setRegistrationStatus(apiStatusMsg);
      setStatus('ready');

      if (onKeyGenerated) {
        onKeyGenerated({
          username: cleanUsername,
          publicKeyPem: pem,
          fingerprint: keyFingerprint,
        });
      }
    } catch (err) {
      setError(err.message || 'Keypair generation failed');
      setRegistrationStatus('Registration failed');
      setStatus('error');
    }
  };

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="key-setup-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div className="modal-container hud-glass w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0B0C10]">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-white/10 dark:bg-[#0B0C10]">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-zinc-600 dark:text-[#A1A1AA]" />
            <h3 id="key-setup-title" className="font-mono text-sm font-semibold text-zinc-900 dark:text-[#FAFAFA]">
              Identity &amp; Key Setup (Mode A)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-close rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-black dark:text-[#71717A] dark:hover:bg-white/5 dark:hover:text-[#FAFAFA]"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="mb-4 text-xs leading-relaxed text-zinc-600 dark:text-[#A1A1AA]">
            Generate a hardware-isolated, non-extractable RSA-OAEP 2048-bit keypair. Your private key stays inside browser IndexedDB while your public key is published for Mode A encrypted transfers.
          </p>

          <form onSubmit={handleGenerateAndRegister} className="space-y-4">
            <div>
              <label htmlFor="vaultx-key-username" className="mb-1.5 block font-mono text-xs font-medium text-zinc-600 dark:text-[#71717A]">
                Handle / Username
              </label>
              <input
                id="vaultx-key-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. alice"
                className="key-username-input hud-well w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-white/10 dark:text-[#FAFAFA] dark:placeholder-[#71717A] dark:focus:border-[#10B981]"
              />
            </div>

            <button
              type="submit"
              disabled={status === 'generating'}
              className="btn-generate-key inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 text-white hover:bg-black shadow-md dark:bg-[#10B981] dark:shadow-emerald-500/25 dark:hover:bg-[#059669] px-4 py-2.5 font-mono text-xs font-semibold tracking-wide disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${status === 'generating' ? 'animate-spin' : ''}`} />
              <span>
                {status === 'generating' ? 'Generating RSA-OAEP Keypair...' : 'Generate & Register Keypair'}
              </span>
            </button>
          </form>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-zinc-400 bg-zinc-100 p-3 text-xs text-zinc-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {(fingerprint || registrationStatus) && (
            <div className="hud-well mt-4 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-white/10">
              {registrationStatus && (
                <div className="registration-status flex items-center gap-2 font-mono text-xs font-medium text-zinc-900 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-zinc-800 dark:text-emerald-400" />
                  <span>{registrationStatus}</span>
                </div>
              )}

              {fingerprint && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] font-medium text-zinc-500 dark:text-[#71717A]">
                    <ShieldCheck className="h-3.5 w-3.5 text-zinc-600 dark:text-[#A1A1AA]" />
                    <span>Public Key SHA-256 Fingerprint</span>
                  </div>
                  <div className="fingerprint-badge break-all rounded border border-zinc-300 bg-white px-2.5 py-2 font-mono text-xs text-zinc-800 dark:border-white/10 dark:bg-[#050508] dark:text-zinc-200 select-all">
                    {fingerprint}
                  </div>
                </div>
              )}

              {publicKeyPem && (
                <details className="text-xs text-zinc-600 dark:text-[#A1A1AA]">
                  <summary className="cursor-pointer font-mono text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-[#71717A] dark:hover:text-[#FAFAFA]">
                    View SPKI Public Key PEM
                  </summary>
                  <pre className="mt-2 max-h-32 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] text-zinc-800 dark:border-white/10 dark:bg-[#050508] dark:text-zinc-300">
                    {publicKeyPem}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-zinc-200 bg-zinc-50 px-5 py-3.5 dark:border-white/10 dark:bg-[#07080B]">
          <button
            type="button"
            onClick={onClose}
            className="btn-close rounded-md border border-zinc-300 bg-white px-4 py-1.5 font-mono text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default KeySetupModal;
