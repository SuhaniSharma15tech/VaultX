'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import {
  Upload,
  FileText,
  Lock,
  Link2,
  UserCheck,
  QrCode,
  Copy,
  Check,
  AlertCircle,
  Flame,
  ShieldAlert,
  Search,
  X,
  RotateCcw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useUpload } from '../hooks/useUpload.js';
import { QRModal } from './QRModal.jsx';
import { TerminalWindow } from './TerminalWindow.jsx';
import { ThemeSelect } from './ThemeSelect.jsx';

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * UploadCard
 * Obsidian Black (#050508), Matte Charcoal (#0B0C10), Cyber Green (#10B981),
 * Matrix Green (#22C55E), and Tactical Crimson (#EF4444) upload & encryption card.
 */
export function UploadCard() {
  const {
    tab,
    setTab,
    mode,
    setMode,
    file,
    setFile,
    textNote,
    setTextNote,
    recipientUsername,
    setRecipientUsername,
    recipientInfo,
    lookupRecipient,
    expiryMinutes,
    setExpiryMinutes,
    maxDownloads,
    setMaxDownloads,
    isBurnAfterReading,
    setIsBurnAfterReading,
    isPasswordProtected,
    setIsPasswordProtected,
    password,
    setPassword,
    status,
    result,
    error,
    executeUpload,
    reset,
  } = useUpload();

  const [isDragging, setIsDragging] = useState(false);
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState([]);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lookupStatus, setLookupStatus] = useState('');
  const fileInputRef = useRef(null);

  const isBusy = status === 'encrypting' || status === 'uploading';

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) {
      setFile(dropped);
      setIsFileUploaded(false);
      setGeneratedLinks([]);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setIsFileUploaded(false);
      setGeneratedLinks([]);
    }
  };

  const handleLookupRecipient = async () => {
    const target = recipientUsername.trim();
    if (!target) return;
    setLookupStatus('searching');
    const info = await lookupRecipient(target);
    setLookupStatus(info ? 'found' : 'not_found');
  };

  const handleBurnToggle = (checked) => {
    setIsBurnAfterReading(checked);
    if (checked) {
      setMaxDownloads(1);
    }
  };

  const handleCopyText = async (val, setter) => {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch (_) { }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (tab === 'file' && !isFileUploaded) {
      if (!file) return;
      setIsFileUploaded(true);
      return;
    }
    try {
      const uploadResult = await executeUpload();
      if (uploadResult?.fullShareUrl) {
        setGeneratedLinks((prev) => [
          {
            fileId: uploadResult.fileId,
            fullShareUrl: uploadResult.fullShareUrl,
            mode,
            expiryMinutes,
            maxDownloads,
            isBurnAfterReading,
            isPasswordProtected,
          },
          ...prev,
        ]);
      }
    } catch (_) {
      // Error state is handled by useUpload
    }
  };

  const handleReset = () => {
    reset();
    setIsFileUploaded(false);
    setGeneratedLinks([]);
    setLookupStatus('');
    setCopiedLink(false);
    setCopiedToken(false);
    setIsQrOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const needsFileUploadStep = tab === 'file' && !isFileUploaded;

  const getActionLabel = () => {
    if (needsFileUploadStep) return 'Upload File';
    if (status === 'encrypting') return 'Encrypting...';
    if (status === 'uploading') return 'Uploading...';
    if (status === 'error') return 'Retry Encrypt & Share';
    return 'Encrypt & Share';
  };

  const isSubmitDisabled = needsFileUploadStep
    ? isBusy || !file
    : isBusy ||
    (tab === 'file' && !file) ||
    (tab === 'text' && !textNote.trim()) ||
    (mode === 'MODE_A' && !recipientUsername.trim()) ||
    (isPasswordProtected && !password);

  return (
    <section className="upload-card">
      <TerminalWindow>
        <div className="p-4 sm:p-5">
          {/* Dual Input Tabs */}
          <div className="tabs mb-4 flex gap-2 border-b border-zinc-200 dark:border-white/10 pb-3" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'file'}
              onClick={() => setTab('file')}
              disabled={isBusy}
              className={`tab-file inline-flex items-center gap-2 rounded-md border px-3.5 py-1.5 text-xs font-medium transition-all ${tab === 'file'
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-[#10B981]/60 dark:bg-[#10B981]/15 dark:text-white'
                : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-[#A1A1AA] dark:hover:border-white/20 dark:hover:text-[#FAFAFA]'
                }`}
            >
              <Upload className={`h-3.5 w-3.5 ${tab === 'file' ? 'text-white dark:text-[#10B981]' : 'text-zinc-400 dark:text-[#71717A]'}`} />
              <span>File Upload</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === 'text'}
              onClick={() => setTab('text')}
              disabled={isBusy}
              className={`tab-note inline-flex items-center gap-2 rounded-md border px-3.5 py-1.5 text-xs font-medium transition-all ${tab === 'text'
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-[#10B981]/60 dark:bg-[#10B981]/15 dark:text-white'
                : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-[#A1A1AA] dark:hover:border-white/20 dark:hover:text-[#FAFAFA]'
                }`}
            >
              <FileText className={`h-3.5 w-3.5 ${tab === 'text' ? 'text-white dark:text-[#10B981]' : 'text-zinc-400 dark:text-[#71717A]'}`} />
              <span>Secret Text Note</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tab Panel: File Dropzone vs Secret Text Editor */}
            {tab === 'file' ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isBusy && fileInputRef.current?.click()}
                className={`dropzone hud-well flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-5 text-center transition-all ${isDragging
                  ? 'border-zinc-900 bg-zinc-100 dark:border-[#10B981] dark:bg-[#10B981]/10'
                  : 'border-zinc-300 hover:border-zinc-400 dark:border-white/15 dark:hover:border-white/30'
                  }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  disabled={isBusy}
                  className="hidden"
                  aria-label="Select file to encrypt"
                />
                {file ? (
                  <div className="flex w-full max-w-md items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm dark:border-white/10 dark:bg-[#0B0C10]">
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-[#FAFAFA]">{file.name}</p>
                        {isFileUploaded && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:border-[#10B981]/40 dark:bg-[#10B981]/15 dark:text-[#4ADE80]">
                            <Check className="h-2.5 w-2.5" />
                            <span>Uploaded</span>
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-xs text-zinc-500 dark:text-[#71717A]">
                        {formatBytes(file.size)} &bull; {file.type || 'application/octet-stream'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setIsFileUploaded(false);
                        setGeneratedLinks([]);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:text-[#71717A] dark:hover:bg-white/5 dark:hover:text-[#FAFAFA]"
                      aria-label="Remove selected file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 dark:border-[#10B981]/40 dark:bg-[#10B981]/15">
                      <Upload className="h-5 w-5 text-zinc-800 dark:text-[#10B981]" />
                    </div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-[#FAFAFA]">
                      Drag and drop a file here, or click to browse
                    </p>
                    <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-[#71717A]">
                      Encrypted locally with AES-256-GCM before leaving your browser
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="secret-note-editor">
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="vaultx-secret-note" className="font-mono text-xs font-medium text-zinc-600 dark:text-[#A1A1AA]">
                    Secret Text Payload
                  </label>
                  <span className="font-mono text-xs text-zinc-400 dark:text-[#71717A]">
                    {new TextEncoder().encode(textNote).byteLength} bytes
                  </span>
                </div>
                <textarea
                  id="vaultx-secret-note"
                  rows={6}
                  value={textNote}
                  onChange={(e) => setTextNote(e.target.value)}
                  disabled={isBusy}
                  placeholder="Paste API keys, recovery phrases, or private notes..."
                  className="secret-note-textarea hud-well w-full rounded-xl border border-zinc-200 p-3.5 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-white/10 dark:text-[#FAFAFA] dark:placeholder-[#71717A] dark:focus:border-[#10B981]"
                />
              </div>
            )}

            {/* Mode Selector */}
            <div className="mode-selector rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-white/10 dark:bg-[#07080B]">
              <p className="mb-2.5 text-xs font-medium text-zinc-500 dark:text-[#71717A]">
                Cryptographic Sharing Mode
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-all ${mode === 'MODE_A'
                    ? 'border-zinc-900 bg-zinc-200/60 dark:border-[#10B981] dark:bg-[#10B981]/10'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-white/10 dark:bg-[#0B0C10] dark:hover:border-white/20'
                    }`}
                >
                  <input
                    type="radio"
                    name="vaultx-mode"
                    value="MODE_A"
                    checked={mode === 'MODE_A'}
                    onChange={() => setMode('MODE_A')}
                    disabled={isBusy}
                    className="mt-0.5 accent-zinc-900 dark:accent-[#10B981]"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-zinc-900 dark:text-[#FAFAFA]">
                      <UserCheck className={`h-3.5 w-3.5 ${mode === 'MODE_A' ? 'text-zinc-900 dark:text-[#10B981]' : 'text-zinc-400 dark:text-[#71717A]'}`} />
                      <span>Mode A: Recipient Public Key</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-[#A1A1AA]">
                      AES key wrapped with recipient RSA-OAEP public key. Zero fragment.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-all ${mode === 'MODE_B'
                    ? 'border-zinc-900 bg-zinc-200/60 dark:border-[#10B981] dark:bg-[#10B981]/10'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-white/10 dark:bg-[#0B0C10] dark:hover:border-white/20'
                    }`}
                >
                  <input
                    type="radio"
                    name="vaultx-mode"
                    value="MODE_B"
                    checked={mode === 'MODE_B'}
                    onChange={() => setMode('MODE_B')}
                    disabled={isBusy}
                    className="mt-0.5 accent-zinc-900 dark:accent-[#10B981]"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-zinc-900 dark:text-[#FAFAFA]">
                      <Link2 className={`h-3.5 w-3.5 ${mode === 'MODE_B' ? 'text-zinc-900 dark:text-[#10B981]' : 'text-zinc-400 dark:text-[#71717A]'}`} />
                      <span>Mode B: Anonymous Fragment Link</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-[#A1A1AA]">
                      Ephemeral AES key stored only in URL{' '}
                      <code className="rounded border border-zinc-200 bg-zinc-100 px-1 py-0.5 text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                        #key=
                      </code>{' '}
                      fragment.
                    </p>
                  </div>
                </label>
              </div>

              {mode === 'MODE_A' && (
                <div className="mt-3.5 space-y-2.5 border-t border-zinc-200 dark:border-white/10 pt-3.5">
                  <label htmlFor="vaultx-recipient" className="block font-mono text-xs font-medium text-zinc-600 dark:text-[#A1A1AA]">
                    Recipient Handle &amp; Key Verification
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="vaultx-recipient"
                      type="text"
                      value={recipientUsername}
                      onChange={(e) => {
                        setRecipientUsername(e.target.value);
                        setLookupStatus('');
                      }}
                      disabled={isBusy}
                      placeholder="Enter recipient handle (e.g. alice)"
                      className="recipient-input flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-white/10 dark:bg-[#0B0C10] dark:text-[#FAFAFA] dark:placeholder-[#71717A] dark:focus:border-[#10B981]"
                    />
                    <button
                      type="button"
                      onClick={handleLookupRecipient}
                      disabled={isBusy || !recipientUsername.trim()}
                      className="btn-lookup-recipient inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-xs font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>Verify Key</span>
                    </button>
                  </div>

                  {recipientInfo && (
                    <div className="recipient-fingerprint rounded-lg border border-zinc-300 bg-zinc-100 p-2.5 text-xs dark:border-emerald-500/35 dark:bg-emerald-950/20">
                      <p className="font-mono font-semibold text-zinc-900 dark:text-emerald-400">
                        Verified Key for {recipientInfo.username}
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] text-zinc-600 dark:text-[#A1A1AA]">
                        Fingerprint: {recipientInfo.fingerprint}
                      </p>
                    </div>
                  )}

                  {lookupStatus === 'not_found' && !recipientInfo && (
                    <p className="font-mono text-xs text-zinc-700 dark:text-red-400">
                      Recipient not found. Ask them to generate a keypair via Key Setup first.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Expiration, Download Limits & Security Options */}
            <div className="controls-grid grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 sm:grid-cols-2 dark:border-white/10 dark:bg-[#07080B]">
              <div>
                <label htmlFor="vaultx-ttl" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#71717A]">
                  Expiration (TTL)
                </label>
                <ThemeSelect
                  id="vaultx-ttl"
                  value={expiryMinutes}
                  onChange={(val) => setExpiryMinutes(Number(val))}
                  disabled={isBusy}
                  options={[
                    { value: 10, label: '10 Minutes' },
                    { value: 60, label: '1 Hour' },
                    { value: 1440, label: '24 Hours' },
                    { value: 10080, label: '7 Days' },
                  ]}
                />
              </div>

              <div>
                <label htmlFor="vaultx-max-downloads" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#71717A]">
                  Max Downloads
                </label>
                <input
                  id="vaultx-max-downloads"
                  type="number"
                  min={1}
                  max={100}
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(Math.max(1, Number(e.target.value) || 1))}
                  disabled={isBusy || isBurnAfterReading}
                  className="max-downloads-input w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none disabled:opacity-50 dark:border-white/10 dark:bg-[#0B0C10] dark:text-[#FAFAFA] dark:focus:border-[#10B981]"
                />
              </div>

              {/* Burn After Reading (1 View) */}
              <div
                className={`flex items-center justify-between gap-2.5 rounded-lg border px-3 py-2 transition-colors sm:col-span-2 ${isBurnAfterReading
                  ? 'border-red-500/50 bg-red-50/80 text-red-700 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-300'
                  : 'border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-[#0B0C10] dark:text-[#A1A1AA]'
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    id="vaultx-burn"
                    type="checkbox"
                    checked={isBurnAfterReading}
                    onChange={(e) => handleBurnToggle(e.target.checked)}
                    disabled={isBusy}
                    className="burn-checkbox h-4 w-4 rounded accent-red-600 dark:border-red-500/40 dark:bg-[#050508] dark:accent-red-500 cursor-pointer"
                  />
                  <label htmlFor="vaultx-burn" className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium">
                    <Flame className={`h-3.5 w-3.5 ${isBurnAfterReading ? 'text-red-600 dark:text-red-400' : 'text-zinc-400 dark:text-[#71717A]'}`} />
                    <span className={isBurnAfterReading ? 'text-red-700 dark:text-red-300 font-semibold' : ''}>
                      Burn After Reading (1 View)
                    </span>
                  </label>
                </div>
                {isBurnAfterReading && (
                  <span className="rounded border border-red-500/40 bg-red-100 text-red-700 dark:border-red-500/50 dark:bg-red-950/60 dark:text-red-300 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider">
                    Self-Destruct Armed
                  </span>
                )}
              </div>

              {/* Password Protection */}
              <div
                className={`space-y-2.5 rounded-lg border px-3 py-2.5 transition-colors sm:col-span-2 ${isPasswordProtected
                  ? 'border-blue-900/40 bg-blue-50/60 text-blue-950 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-300'
                  : 'border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-[#0B0C10] dark:text-[#A1A1AA]'
                  }`}
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <input
                      id="vaultx-password-toggle"
                      type="checkbox"
                      checked={isPasswordProtected}
                      onChange={(e) => setIsPasswordProtected(e.target.checked)}
                      disabled={isBusy}
                      className="password-toggle h-4 w-4 rounded accent-blue-900 dark:border-red-500/40 dark:bg-[#050508] dark:accent-red-500 cursor-pointer"
                    />
                    <label htmlFor="vaultx-password-toggle" className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium">
                      <Lock className={`h-3.5 w-3.5 ${isPasswordProtected ? 'text-blue-900 dark:text-red-400' : 'text-zinc-400 dark:text-[#71717A]'}`} />
                      <span className={isPasswordProtected ? 'text-blue-950 dark:text-red-300 font-semibold' : ''}>
                        Require Additional Password (PBKDF2 key wrapping)
                      </span>
                    </label>
                  </div>
                  {isPasswordProtected && (
                    <span className="rounded border border-blue-300 bg-blue-100 text-blue-900 dark:border-red-500/50 dark:bg-red-950/60 dark:text-red-300 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider">
                      Locked
                    </span>
                  )}
                </div>

                {isPasswordProtected && (
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isBusy}
                      placeholder="Enter link protection password..."
                      aria-label="Vault protection password"
                      className="password-input w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 pr-10 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-red-500/30 dark:bg-[#050508] dark:text-[#FAFAFA] dark:placeholder-[#71717A] dark:focus:border-red-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isBusy}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-900 dark:text-[#71717A] dark:hover:text-[#FAFAFA] transition-colors focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="error-banner flex items-start gap-2 rounded-lg border border-zinc-400 bg-zinc-100 p-3 text-xs text-zinc-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Dynamic Action Button */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="btn-upload inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 text-white hover:bg-black shadow-lg shadow-zinc-900/15 dark:bg-[#10B981] dark:shadow-emerald-500/25 dark:hover:bg-[#059669] px-5 py-3 font-mono text-sm font-semibold tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {needsFileUploadStep ? (
                  <Upload className="h-4 w-4" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                <span>{getActionLabel()}</span>
              </button>

              {(status === 'success' || status === 'error') && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn-reset inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-3 font-mono text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </form>

          {/* Share Output Section */}
          {status === 'success' && result && (
            <div className="share-output hud-well mt-5 space-y-4 rounded-xl border border-zinc-300 p-4 dark:border-emerald-500/35">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-2.5">
                <h3 className="font-mono text-sm font-bold text-zinc-900 dark:text-emerald-400">
                  Vault Ready &amp; Encrypted
                </h3>
                <span className="font-mono text-xs text-zinc-500 dark:text-[#71717A]">ID: {result.fileId}</span>
              </div>

              {/* Shareable Link */}
              <div>
                <label className="mb-1.5 block font-mono text-xs font-medium text-zinc-600 dark:text-[#71717A]">
                  Shareable Zero-Knowledge Link
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    readOnly
                    value={result.fullShareUrl}
                    aria-label="Shareable link"
                    className="share-url-input min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-xs text-zinc-900 dark:border-white/10 dark:bg-[#0B0C10] dark:text-zinc-200 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyText(result.fullShareUrl, setCopiedLink)}
                    className="btn-copy-link inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 font-mono text-xs font-semibold text-white hover:bg-black dark:bg-[#10B981] dark:shadow-emerald-500/20 dark:hover:bg-[#059669]"
                  >
                    {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsQrOpen(true)}
                    className="btn-open-qr inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    <span>QR Code</span>
                  </button>
                </div>
              </div>

              {/* Owner Revocation Token Banner */}
              <div className="owner-token-banner rounded-lg border border-zinc-300 bg-zinc-100 p-3 dark:border-red-500/30 dark:bg-red-500/5">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-zinc-700 dark:text-red-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-bold text-zinc-900 dark:text-[#FAFAFA]">Owner Revocation Token</p>
                    <p className="mt-0.5 text-xs text-zinc-600 dark:text-[#A1A1AA]">
                      Save this token to audit access or destroy the vault early from the{' '}
                      <Link href="/dashboard" className="text-zinc-900 underline hover:text-black dark:text-zinc-200 dark:hover:text-white font-medium">
                        Sender Dashboard
                      </Link>
                      .
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 truncate rounded border border-zinc-300 bg-white px-2.5 py-1 font-mono text-xs text-zinc-900 dark:border-white/10 dark:bg-[#050508] dark:text-zinc-200 select-all">
                        {result.ownerToken}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyText(result.ownerToken, setCopiedToken)}
                        className="btn-copy-token inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-1 font-mono text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
                      >
                        {copiedToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {result.sha256Checksum && (
                <p className="truncate font-mono text-[11px] text-[#71717A]">
                  Plaintext SHA-256: {result.sha256Checksum}
                </p>
              )}

              {generatedLinks.length > 1 && (
                <div className="border-t border-white/10 pt-3">
                  <p className="mb-2 font-mono text-[11px] font-medium text-[#A1A1AA]">
                    Generated Links for This File ({generatedLinks.length})
                  </p>
                  <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                    {generatedLinks.map((entry, idx) => (
                      <div
                        key={`${entry.fileId}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-[#0B0C10] px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-[11px] text-zinc-200">
                            {entry.fullShareUrl}
                          </p>
                          <p className="font-mono text-[10px] text-[#71717A]">
                            {entry.mode} &bull; {entry.maxDownloads}dl &bull; {entry.expiryMinutes}m
                            {entry.isBurnAfterReading ? ' • Burn' : ''}
                            {entry.isPasswordProtected ? ' • Password' : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard?.writeText(entry.fullShareUrl)}
                          className="shrink-0 rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-200 hover:bg-white/10"
                        >
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </TerminalWindow>

      <QRModal
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        shareUrl={result?.fullShareUrl || ''}
      />
    </section>
  );
}

export default UploadCard;
