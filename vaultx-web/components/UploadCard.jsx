'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  File as FileIcon,
  Clock,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useUpload } from '../hooks/useUpload.js';
import { useAuth, getUserVaultStorageKey } from '../lib/authContext.js';
import { getUserPubKey, updateVaultSettings } from '../lib/api.js';
import { QRModal } from './QRModal.jsx';
import { TerminalWindow } from './TerminalWindow.jsx';
import { ThemeSelect } from './ThemeSelect.jsx';

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return '-';
  }
}

function createDefaultFileSettings(seed = {}) {
  const isBurn = Boolean(seed.isBurnAfterReading);
  return {
    mode: seed.mode || 'MODE_B',
    recipientUsername: seed.recipientUsername || '',
    recipientInfo: seed.recipientInfo || null,
    expiryMinutes: Number(seed.expiryMinutes) || 60,
    maxDownloads: isBurn ? 1 : Number(seed.maxDownloads) || 5,
    isBurnAfterReading: isBurn,
    isPasswordProtected: Boolean(seed.isPasswordProtected),
    password: seed.password || '',
  };
}

function getSettingsStorageKey(user) {
  const ownerKey = user ? (user.id || user.email || 'guest') : 'guest';
  return `vaultx_file_settings_${ownerKey}`;
}

/**
 * UploadCard
 * File Upload flow: Select File -> Upload File -> Recent File Card -> File Details & Settings (isolated per fileId) -> Encrypt & Share.
 * Secret Text Note flow: Enter Note -> Configure Settings -> Encrypt & Share.
 */
export function UploadCard() {
  const router = useRouter();
  const { user } = useAuth();
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
    uploadBaseFile,
    shareExistingFile,
    reset,
  } = useUpload();

  const [isDragging, setIsDragging] = useState(false);
  const [recentFiles, setRecentFiles] = useState([]);
  const [selectedFileCardId, setSelectedFileCardId] = useState(null);
  const [duplicateFileInfo, setDuplicateFileInfo] = useState(null);
  const [ttlUnitMap, setTtlUnitMap] = useState({});

  // Per-file isolated state keyed by fileId
  const [settingsByFileId, setSettingsByFileId] = useState({});
  const [cardLookupStatusMap, setCardLookupStatusMap] = useState({});
  const [cardShowPasswordMap, setCardShowPasswordMap] = useState({});
  const [shareStatusMap, setShareStatusMap] = useState({});
  const [shareErrorMap, setShareErrorMap] = useState({});
  const [shareResultMap, setShareResultMap] = useState({});
  const [generatedLinksMap, setGeneratedLinksMap] = useState({});

  const [isQrOpen, setIsQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formLookupStatus, setFormLookupStatus] = useState('');
  const fileInputRef = useRef(null);

  const isBusy = status === 'encrypting' || status === 'uploading';

  const persistSettingsMap = useCallback(
    (mapToSave) => {
      if (typeof window === 'undefined' || !window.localStorage) return;
      try {
        const sanitized = {};
        for (const [fid, cfg] of Object.entries(mapToSave)) {
          if (!cfg) continue;
          sanitized[fid] = {
            mode: cfg.mode,
            recipientUsername: cfg.recipientUsername,
            recipientInfo: cfg.recipientInfo,
            expiryMinutes: cfg.expiryMinutes,
            maxDownloads: cfg.maxDownloads,
            isBurnAfterReading: cfg.isBurnAfterReading,
            isPasswordProtected: cfg.isPasswordProtected,
            // Do not persist plaintext password to localStorage
            password: '',
          };
        }
        window.localStorage.setItem(getSettingsStorageKey(user), JSON.stringify(sanitized));
      } catch (_) { }
    },
    [user]
  );

  // Hydrate latest 3 uploaded files and their per-file settings for the active user
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    let hydratedSettings = {};
    try {
      const rawSettings = window.localStorage.getItem(getSettingsStorageKey(user));
      const parsedSettings = rawSettings ? JSON.parse(rawSettings) : {};
      if (parsedSettings && typeof parsedSettings === 'object') {
        for (const [fid, cfg] of Object.entries(parsedSettings)) {
          hydratedSettings[fid] = createDefaultFileSettings(cfg);
        }
      }
    } catch (_) { }

    try {
      const storageKey = getUserVaultStorageKey(user);
      const raw = window.localStorage.getItem(storageKey);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        const baseUploads = list
          .filter((item) => item.itemType !== 'SECRET_NOTE' && item.fileKeyB64Url)
          .slice(0, 3);
        for (const item of baseUploads) {
          const fid = item.fileId || item.id;
          if (fid && !hydratedSettings[fid]) {
            hydratedSettings[fid] = createDefaultFileSettings(item.settings || item);
          }
        }
        setRecentFiles(baseUploads);
      } else {
        setRecentFiles([]);
      }
    } catch (_) {
      setRecentFiles([]);
    }

    setSettingsByFileId(hydratedSettings);
    setSelectedFileCardId(null);
    setShareResultMap({});
    setShareErrorMap({});
    setShareStatusMap({});
    setCardLookupStatusMap({});
    setCardShowPasswordMap({});
  }, [user]);

  const selectedFileCard =
    recentFiles.find((f) => (f.fileId || f.id) === selectedFileCardId) || null;
  const activeCardId = selectedFileCard ? (selectedFileCard.fileId || selectedFileCard.id) : null;
  const activeCardSettings = activeCardId
    ? settingsByFileId[activeCardId] || createDefaultFileSettings(selectedFileCard)
    : null;
  const activeShareStatus = activeCardId ? shareStatusMap[activeCardId] || 'idle' : 'idle';
  const activeShareError = activeCardId ? shareErrorMap[activeCardId] || '' : '';
  const activeShareResult = activeCardId ? shareResultMap[activeCardId] || null : null;
  const isSharing = activeShareStatus === 'sharing';

  const updateCardSettings = useCallback(
    (cardId, patch) => {
      if (!cardId) return;
      const cardRecord = recentFiles.find((f) => (f.fileId || f.id) === cardId);

      setSettingsByFileId((prev) => {
        const current = prev[cardId] || createDefaultFileSettings(cardRecord || {});
        const next = { ...current, ...patch };
        if (patch.isBurnAfterReading === true) {
          next.maxDownloads = 1;
        }
        const nextMap = { ...prev, [cardId]: next };
        persistSettingsMap(nextMap);

        // Target only this specific fileId on the backend
        if (cardRecord?.ownerToken) {
          updateVaultSettings(cardId, cardRecord.ownerToken, next).catch(() => { });
        }
        return nextMap;
      });
    },
    [recentFiles, persistSettingsMap]
  );

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
      setDuplicateFileInfo(null);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setDuplicateFileInfo(null);
    }
  };

  const handleFormLookupRecipient = async () => {
    const target = recipientUsername.trim();
    if (!target) return;
    setFormLookupStatus('searching');
    const info = await lookupRecipient(target);
    setFormLookupStatus(info ? 'found' : 'not_found');
  };

  const handleCardLookupRecipient = async (cardId, usernameToFind) => {
    const target = (usernameToFind || '').trim();
    if (!cardId || !target) return;
    setCardLookupStatusMap((prev) => ({ ...prev, [cardId]: 'searching' }));
    try {
      const res = await getUserPubKey(target);
      if (res && res.success) {
        updateCardSettings(cardId, { recipientInfo: res });
        setCardLookupStatusMap((prev) => ({ ...prev, [cardId]: 'found' }));
        return;
      }
    } catch (_) { }
    updateCardSettings(cardId, { recipientInfo: null });
    setCardLookupStatusMap((prev) => ({ ...prev, [cardId]: 'not_found' }));
  };

  const handleCopyText = async (val, setter) => {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch (_) { }
  };

  // File Upload tab submit: uploads the selected file and snapshots its initial independent settings
  const handleFileUploadSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setDuplicateFileInfo(null);
    const initialSettingsSnapshot = createDefaultFileSettings({
      mode,
      recipientUsername,
      recipientInfo,
      expiryMinutes,
      maxDownloads,
      isBurnAfterReading,
      isPasswordProtected,
      password,
    });

    try {
      const uploaded = await uploadBaseFile();
      if (uploaded) {
        const newId = uploaded.fileId || uploaded.id;
        if (fileInputRef.current) fileInputRef.current.value = '';

        setSettingsByFileId((prev) => {
          const nextMap = { ...prev, [newId]: initialSettingsSnapshot };
          persistSettingsMap(nextMap);
          return nextMap;
        });

        // Sync initial settings for this specific fileId on backend
        if (uploaded.ownerToken) {
          updateVaultSettings(newId, uploaded.ownerToken, initialSettingsSnapshot).catch(() => {});
        }

        setRecentFiles((prev) => [uploaded, ...prev].slice(0, 3));
        setSelectedFileCardId(newId);
      }
    } catch (err) {
      if (err?.code === 'DUPLICATE_FILE' && err.existingFile) {
        setDuplicateFileInfo(err.existingFile);
      }
    }
  };

  const handleOpenExistingFile = () => {
    if (!duplicateFileInfo) return;
    const existingId = duplicateFileInfo.fileId || duplicateFileInfo.id;
    let foundRecord = recentFiles.find((f) => (f.fileId || f.id) === existingId) || null;

    if (!foundRecord && typeof window !== 'undefined' && window.localStorage) {
      try {
        const storageKey = getUserVaultStorageKey(user);
        const raw = window.localStorage.getItem(storageKey);
        const list = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list)) {
          foundRecord = list.find((item) => (item.fileId || item.id) === existingId) || null;
        }
      } catch (_) {}
    }

    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDuplicateFileInfo(null);

    if (foundRecord && foundRecord.fileKeyB64Url) {
      setRecentFiles((prev) => {
        const filtered = prev.filter((item) => (item.fileId || item.id) !== existingId);
        return [foundRecord, ...filtered].slice(0, 3);
      });
      setSelectedFileCardId(existingId);
    } else {
      router.push('/dashboard');
    }
  };

  // Selected File Card -> Encrypt & Share using ONLY that card's isolated settings
  const handleShareSelectedFile = async () => {
    if (!selectedFileCard || !activeCardId || !activeCardSettings) return;
    setShareStatusMap((prev) => ({ ...prev, [activeCardId]: 'sharing' }));
    setShareErrorMap((prev) => ({ ...prev, [activeCardId]: '' }));

    try {
      const res = await shareExistingFile(selectedFileCard, activeCardSettings);
      setShareResultMap((prev) => ({ ...prev, [activeCardId]: res }));
      setShareStatusMap((prev) => ({ ...prev, [activeCardId]: 'success' }));

      setRecentFiles((prev) =>
        prev.map((item) =>
          (item.fileId || item.id) === activeCardId ? { ...item, status: 'SHARED' } : item
        )
      );
      setGeneratedLinksMap((prev) => ({
        ...prev,
        [activeCardId]: [res, ...(prev[activeCardId] || [])],
      }));
    } catch (err) {
      setShareErrorMap((prev) => ({
        ...prev,
        [activeCardId]: err.message || 'Failed to generate share link',
      }));
      setShareStatusMap((prev) => ({ ...prev, [activeCardId]: 'error' }));
    }
  };

  // Secret Text Note tab submit
  const handleNoteSubmit = async (e) => {
    e.preventDefault();
    try {
      await executeUpload();
    } catch (_) { }
  };

  const handleResetNote = () => {
    reset();
    setFormLookupStatus('');
    setCopiedLink(false);
    setCopiedToken(false);
    setIsQrOpen(false);
  };

  const formSettings = {
    mode,
    recipientUsername,
    recipientInfo,
    expiryMinutes,
    maxDownloads,
    isBurnAfterReading,
    isPasswordProtected,
    password,
  };

  const updateFormSettings = (patch) => {
    if (patch.mode !== undefined) setMode(patch.mode);
    if (patch.recipientUsername !== undefined) setRecipientUsername(patch.recipientUsername);
    if (patch.expiryMinutes !== undefined) setExpiryMinutes(patch.expiryMinutes);
    if (patch.maxDownloads !== undefined) setMaxDownloads(patch.maxDownloads);
    if (patch.isBurnAfterReading !== undefined) {
      setIsBurnAfterReading(patch.isBurnAfterReading);
      if (patch.isBurnAfterReading) setMaxDownloads(1);
    }
    if (patch.isPasswordProtected !== undefined) setIsPasswordProtected(patch.isPasswordProtected);
    if (patch.password !== undefined) setPassword(patch.password);
  };

  const renderShareControls = ({
    scopeId,
    settings,
    onUpdate,
    disabled,
    recipientLookupStatus,
    onLookupRecipient,
    showPwd,
    onToggleShowPwd,
  }) => (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="mode-selector rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#07080B] p-3.5">
        <p className="mb-2.5 text-xs font-medium text-zinc-500 dark:text-[#71717A]">
          Cryptographic Sharing Mode
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-all ${settings.mode === 'MODE_A'
                ? 'border-blue-900 bg-blue-50/70 dark:border-[#10B981] dark:bg-[#10B981]/10'
                : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0B0C10] hover:border-zinc-300 dark:hover:border-white/20'
              }`}
          >
            <input
              type="radio"
              name={`vaultx-mode-${scopeId}`}
              value="MODE_A"
              checked={settings.mode === 'MODE_A'}
              onChange={() => onUpdate({ mode: 'MODE_A' })}
              disabled={disabled}
              className="mt-0.5 accent-blue-900 dark:accent-[#10B981]"
            />
            <div>
              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-zinc-900 dark:text-[#FAFAFA]">
                <UserCheck className={`h-3.5 w-3.5 ${settings.mode === 'MODE_A' ? 'text-blue-950 dark:text-[#10B981]' : 'text-zinc-400 dark:text-[#71717A]'}`} />
                <span>Mode A: Recipient Public Key</span>
              </div>
              <p className="mt-1 text-xs text-zinc-600 dark:text-[#A1A1AA]">
                AES key wrapped with recipient RSA-OAEP public key. Zero fragment.
              </p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-all ${settings.mode === 'MODE_B'
                ? 'border-blue-900 bg-blue-50/70 dark:border-[#10B981] dark:bg-[#10B981]/10'
                : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0B0C10] hover:border-zinc-300 dark:hover:border-white/20'
              }`}
          >
            <input
              type="radio"
              name={`vaultx-mode-${scopeId}`}
              value="MODE_B"
              checked={settings.mode === 'MODE_B'}
              onChange={() => onUpdate({ mode: 'MODE_B' })}
              disabled={disabled}
              className="mt-0.5 accent-blue-900 dark:accent-[#10B981]"
            />
            <div>
              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-zinc-900 dark:text-[#FAFAFA]">
                <Link2 className={`h-3.5 w-3.5 ${settings.mode === 'MODE_B' ? 'text-blue-950 dark:text-[#10B981]' : 'text-zinc-400 dark:text-[#71717A]'}`} />
                <span>Mode B: Anonymous Fragment Link</span>
              </div>
              <p className="mt-1 text-xs text-zinc-600 dark:text-[#A1A1AA]">
                Ephemeral AES key stored only in URL{' '}
                <code className="rounded border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 px-1 py-0.5 text-zinc-700 dark:text-zinc-200">
                  #key=
                </code>{' '}
                fragment.
              </p>
            </div>
          </label>
        </div>

        {settings.mode === 'MODE_A' && (
          <div className="mt-3.5 space-y-2.5 border-t border-zinc-200 dark:border-white/10 pt-3.5">
            <label htmlFor={`vaultx-recipient-${scopeId}`} className="block font-mono text-xs font-medium text-zinc-600 dark:text-[#A1A1AA]">
              Recipient Handle &amp; Key Verification
            </label>
            <div className="flex gap-2">
              <input
                id={`vaultx-recipient-${scopeId}`}
                type="text"
                value={settings.recipientUsername}
                onChange={(e) => onUpdate({ recipientUsername: e.target.value, recipientInfo: null })}
                disabled={disabled}
                placeholder="Enter recipient handle (e.g. alice_3f9a1c)"
                className="recipient-input flex-1 rounded-md border border-zinc-300 dark:border-white/10 bg-white dark:bg-[#0B0C10] px-3 py-1.5 font-mono text-sm text-zinc-900 dark:text-[#FAFAFA] placeholder-zinc-400 dark:placeholder-[#71717A] focus:border-blue-950 dark:focus:border-[#10B981] focus:outline-none"
              />
              <button
                type="button"
                onClick={onLookupRecipient}
                disabled={disabled || !settings.recipientUsername.trim()}
                className="btn-lookup-recipient inline-flex items-center gap-1.5 rounded-md border border-zinc-300 dark:border-white/10 bg-zinc-100 dark:bg-white/5 px-3 py-1.5 font-mono text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10 disabled:opacity-50"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Verify Key</span>
              </button>
            </div>

            {settings.recipientInfo && (
              <div className="recipient-fingerprint rounded-lg border border-blue-200 bg-blue-50/70 dark:border-emerald-500/35 dark:bg-emerald-950/20 p-2.5 text-xs">
                <p className="font-mono font-semibold text-blue-950 dark:text-emerald-400">
                  Verified Key for {settings.recipientInfo.username}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-[#A1A1AA]">
                  Fingerprint: {settings.recipientInfo.fingerprint}
                </p>
              </div>
            )}

            {recipientLookupStatus === 'not_found' && !settings.recipientInfo && (
              <p className="font-mono text-xs text-red-400">
                Recipient not found. Ask them to register or generate a keypair via Key Setup first.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Expiration, Download Limits & Security Options */}
      <div className="controls-grid grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#07080B] p-3.5 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor={`vaultx-ttl-${scopeId}`} className="block text-xs font-medium text-zinc-600 dark:text-[#A1A1AA]">
              Key Active Time (Custom TTL)
            </label>
            <span className="font-mono text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
              {(() => {
                const m = Math.max(1, Math.min(10080, Number(settings.expiryMinutes) || 60));
                if (m < 60) return `${m}m active`;
                if (m % 1440 === 0) return `${m / 1440}d active`;
                if (m % 60 === 0) return `${m / 60}h active`;
                return `${Math.floor(m / 60)}h ${m % 60}m active`;
              })()}
            </span>
          </div>

          {(() => {
            const totalMins = Math.max(1, Math.min(10080, Number(settings.expiryMinutes) || 60));
            const currentUnit =
              ttlUnitMap[scopeId] ||
              (totalMins % 1440 === 0 ? 'days' : totalMins % 60 === 0 ? 'hours' : 'minutes');
            const multiplier = currentUnit === 'days' ? 1440 : currentUnit === 'hours' ? 60 : 1;
            const currentVal = Math.max(1, Math.round(totalMins / multiplier));

            const handleValueChange = (e) => {
              const val = Math.max(1, Number(e.target.value) || 1);
              const maxVal = currentUnit === 'days' ? 7 : currentUnit === 'hours' ? 168 : 10080;
              const clamped = Math.min(maxVal, val);
              onUpdate({ expiryMinutes: Math.min(10080, Math.max(1, clamped * multiplier)) });
            };

            const handleUnitChange = (unit) => {
              setTtlUnitMap((prev) => ({ ...prev, [scopeId]: unit }));
              const newMultiplier = unit === 'days' ? 1440 : unit === 'hours' ? 60 : 1;
              const newMins = Math.min(10080, Math.max(1, currentVal * newMultiplier));
              onUpdate({ expiryMinutes: newMins });
            };

            const handlePresetClick = (mins) => {
              const presetUnit = mins % 1440 === 0 ? 'days' : mins % 60 === 0 ? 'hours' : 'minutes';
              setTtlUnitMap((prev) => ({ ...prev, [scopeId]: presetUnit }));
              onUpdate({ expiryMinutes: mins });
            };

            return (
              <>
                <div className="flex gap-2">
                  <input
                    id={`vaultx-ttl-${scopeId}`}
                    type="number"
                    min={1}
                    max={currentUnit === 'days' ? 7 : currentUnit === 'hours' ? 168 : 10080}
                    value={currentVal}
                    onChange={handleValueChange}
                    disabled={disabled}
                    placeholder="Enter custom duration"
                    className="ttl-input flex-1 rounded-md border border-zinc-300 dark:border-white/10 bg-white dark:bg-[#0B0C10] px-3 py-1.5 font-mono text-sm text-zinc-900 dark:text-[#FAFAFA] focus:border-zinc-900 dark:focus:border-[#10B981] focus:outline-none disabled:opacity-50"
                  />
                  <div className="w-28 shrink-0">
                    <ThemeSelect
                      id={`vaultx-ttl-unit-${scopeId}`}
                      value={currentUnit}
                      onChange={handleUnitChange}
                      disabled={disabled}
                      options={[
                        { value: 'minutes', label: 'Minutes' },
                        { value: 'hours', label: 'Hours' },
                        { value: 'days', label: 'Days' },
                      ]}
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="mt-2 flex flex-wrap items-center gap-1 font-mono text-[10px]">
                  <span className="text-zinc-400 dark:text-[#71717A] mr-0.5">Quick:</span>
                  {[
                    { label: '10m', mins: 10 },
                    { label: '30m', mins: 30 },
                    { label: '1h', mins: 60 },
                    { label: '4h', mins: 240 },
                    { label: '12h', mins: 720 },
                    { label: '24h', mins: 1440 },
                    { label: '3d', mins: 4320 },
                    { label: '7d', mins: 10080 },
                  ].map((preset) => {
                    const isActive = totalMins === preset.mins;
                    return (
                      <button
                        key={preset.mins}
                        type="button"
                        onClick={() => handlePresetClick(preset.mins)}
                        disabled={disabled}
                        className={`rounded px-1.5 py-0.5 transition-colors ${
                          isActive
                            ? 'bg-zinc-900 text-white font-bold dark:bg-[#10B981] dark:text-black'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>

        <div>
          <label htmlFor={`vaultx-max-downloads-${scopeId}`} className="mb-1 block text-xs font-medium text-zinc-500 dark:text-[#71717A]">
            Max Downloads
          </label>
          <input
            id={`vaultx-max-downloads-${scopeId}`}
            type="number"
            min={1}
            max={100}
            value={settings.maxDownloads}
            onChange={(e) => onUpdate({ maxDownloads: Math.max(1, Number(e.target.value) || 1) })}
            disabled={disabled || settings.isBurnAfterReading}
            className="max-downloads-input w-full rounded-md border border-zinc-300 dark:border-white/10 bg-white dark:bg-[#0B0C10] px-3 py-1.5 font-mono text-sm text-zinc-900 dark:text-[#FAFAFA] focus:border-blue-950 dark:focus:border-[#10B981] focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* Burn After Reading */}
        <div
          className={`flex items-center justify-between gap-2.5 rounded-lg border px-3 py-2 transition-colors sm:col-span-2 ${settings.isBurnAfterReading
              ? 'border-blue-300 bg-blue-50/90 text-blue-950 dark:border-red-500/60 dark:bg-gradient-to-r dark:from-red-950/40 dark:to-[#0B0C10] dark:text-red-200'
              : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0B0C10] text-zinc-600 dark:text-[#A1A1AA]'
            }`}
        >
          <div className="flex items-center gap-2.5">
            <input
              id={`vaultx-burn-${scopeId}`}
              type="checkbox"
              checked={settings.isBurnAfterReading}
              onChange={(e) => onUpdate({ isBurnAfterReading: e.target.checked })}
              disabled={disabled}
              className="burn-checkbox h-4 w-4 rounded border-zinc-300 accent-blue-900 dark:border-white/20 dark:bg-[#050508] dark:accent-red-500"
            />
            <label htmlFor={`vaultx-burn-${scopeId}`} className={`inline-flex cursor-pointer items-center gap-1.5 text-xs ${settings.isBurnAfterReading ? 'font-semibold text-blue-950 dark:text-red-200' : 'font-medium text-zinc-700 dark:text-zinc-300'}`}>
              <Flame className={`h-3.5 w-3.5 ${settings.isBurnAfterReading ? 'text-blue-900 dark:text-red-400' : 'text-zinc-400 dark:text-[#71717A]'}`} />
              <span>Burn After Reading (1 View)</span>
            </label>
          </div>
          {settings.isBurnAfterReading && (
            <span className="rounded border border-blue-900/30 bg-blue-100/90 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-blue-950 dark:border-red-500/60 dark:bg-red-500/20 dark:text-red-300">
              Self-Destruct Armed
            </span>
          )}
        </div>

        {/* Password Protection */}
        <div
          className={`space-y-2.5 rounded-lg border px-3 py-2.5 transition-colors sm:col-span-2 ${settings.isPasswordProtected
              ? 'border-blue-300 bg-blue-50/90 text-blue-950 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200'
              : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0B0C10] text-zinc-600 dark:text-[#A1A1AA]'
            }`}
        >
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <input
                id={`vaultx-password-toggle-${scopeId}`}
                type="checkbox"
                checked={settings.isPasswordProtected}
                onChange={(e) => onUpdate({ isPasswordProtected: e.target.checked })}
                disabled={disabled}
                className="password-toggle h-4 w-4 rounded border-zinc-300 accent-blue-900 dark:border-white/20 dark:bg-[#050508] dark:accent-red-500"
              />
              <label htmlFor={`vaultx-password-toggle-${scopeId}`} className={`inline-flex cursor-pointer items-center gap-1.5 text-xs ${settings.isPasswordProtected ? 'font-semibold text-blue-950 dark:text-red-200' : 'font-medium text-zinc-700 dark:text-zinc-300'}`}>
                <Lock className={`h-3.5 w-3.5 ${settings.isPasswordProtected ? 'text-blue-900 dark:text-red-400' : 'text-zinc-400 dark:text-[#71717A]'}`} />
                <span>Require Additional Password (PBKDF2 key wrapping)</span>
              </label>
            </div>
            {settings.isPasswordProtected && (
              <span className="rounded border border-blue-900/30 bg-blue-100/90 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-blue-950 dark:border-red-500/60 dark:bg-red-500/20 dark:text-red-300">
                Locked
              </span>
            )}
          </div>

          {settings.isPasswordProtected && (
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={settings.password}
                onChange={(e) => onUpdate({ password: e.target.value })}
                disabled={disabled}
                placeholder="Enter link protection password..."
                aria-label="Vault protection password"
                className="password-input w-full rounded-md border border-red-500/30 bg-[#050508] px-3 py-1.5 pr-10 font-mono text-sm text-[#FAFAFA] placeholder-[#71717A] focus:border-red-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={onToggleShowPwd}
                disabled={disabled}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#71717A] hover:text-[#FAFAFA] transition-colors focus:outline-none"
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderShareOutput = (outputResult, extraLinks = []) => (
    <div className="share-output hud-well mt-4 space-y-4 rounded-xl border border-blue-900/30 dark:border-emerald-500/35 p-4">
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <h3 className="font-mono text-sm font-bold text-blue-950 dark:text-emerald-400">
          Vault Ready &amp; Encrypted
        </h3>
        <span className="font-mono text-xs text-[#71717A]">ID: {outputResult.fileId}</span>
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-xs font-medium text-[#71717A]">
          Shareable Zero-Knowledge Link
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            readOnly
            value={outputResult.fullShareUrl}
            aria-label="Shareable link"
            className="share-url-input min-w-0 flex-1 rounded-md border border-white/10 bg-[#0B0C10] px-3 py-1.5 font-mono text-xs text-zinc-200 select-all"
          />
          <button
            type="button"
            onClick={() => handleCopyText(outputResult.fullShareUrl, setCopiedLink)}
            className="btn-copy-link inline-flex items-center gap-1.5 rounded-md bg-zinc-900 hover:bg-black text-white dark:bg-[#10B981] dark:hover:bg-[#059669] px-3 py-1.5 font-mono text-xs font-semibold shadow-md dark:shadow-emerald-500/20"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedLink ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setQrUrl(outputResult.fullShareUrl);
              setIsQrOpen(true);
            }}
            className="btn-open-qr inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs font-medium text-zinc-200 hover:bg-white/10"
          >
            <QrCode className="h-3.5 w-3.5" />
            <span>QR Code</span>
          </button>
        </div>
      </div>

      <div className="owner-token-banner rounded-lg border border-red-500/30 bg-red-500/5 p-3">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-bold text-[#FAFAFA]">Owner Revocation Token</p>
            <p className="mt-0.5 text-xs text-[#A1A1AA]">
              Save this token to audit access or destroy the vault early from the{' '}
              <Link href="/dashboard" className="text-zinc-200 underline hover:text-white">
                Sender Dashboard
              </Link>
              .
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded border border-white/10 bg-[#050508] px-2.5 py-1 font-mono text-xs text-zinc-200 select-all">
                {outputResult.ownerToken}
              </code>
              <button
                type="button"
                onClick={() => handleCopyText(outputResult.ownerToken, setCopiedToken)}
                className="btn-copy-token inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs font-medium text-zinc-200 hover:bg-white/10"
              >
                {copiedToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedToken ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {outputResult.sha256Checksum && (
        <p className="truncate font-mono text-[11px] text-[#71717A]">
          Plaintext SHA-256: {outputResult.sha256Checksum}
        </p>
      )}

      {extraLinks.length > 1 && (
        <div className="border-t border-white/10 pt-3">
          <p className="mb-2 font-mono text-[11px] font-medium text-[#A1A1AA]">
            Generated Links for This File ({extraLinks.length})
          </p>
          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
            {extraLinks.map((entry, idx) => (
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
  );

  return (
    <section className="upload-card space-y-5">
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
                  ? 'border-blue-900 bg-blue-50 text-blue-950 font-semibold dark:border-[#10B981]/60 dark:bg-[#10B981]/15 dark:text-white'
                  : 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] text-zinc-500 dark:text-[#A1A1AA] hover:border-zinc-300 dark:hover:border-white/20 hover:text-zinc-900 dark:hover:text-[#FAFAFA]'
                }`}
            >
              <Upload className={`h-3.5 w-3.5 ${tab === 'file' ? 'text-blue-950 dark:text-[#10B981]' : 'text-zinc-400 dark:text-[#71717A]'}`} />
              <span>File Upload</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === 'text'}
              onClick={() => setTab('text')}
              disabled={isBusy}
              className={`tab-note inline-flex items-center gap-2 rounded-md border px-3.5 py-1.5 text-xs font-medium transition-all ${tab === 'text'
                  ? 'border-blue-900 bg-blue-50 text-blue-950 font-semibold dark:border-[#10B981]/60 dark:bg-[#10B981]/15 dark:text-white'
                  : 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] text-zinc-500 dark:text-[#A1A1AA] hover:border-zinc-300 dark:hover:border-white/20 hover:text-zinc-900 dark:hover:text-[#FAFAFA]'
                }`}
            >
              <FileText className={`h-3.5 w-3.5 ${tab === 'text' ? 'text-blue-950 dark:text-[#10B981]' : 'text-zinc-400 dark:text-[#71717A]'}`} />
              <span>Secret Text Note</span>
            </button>
          </div>

          {tab === 'file' ? (
            <form onSubmit={handleFileUploadSubmit} className="space-y-4">
              {/* Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isBusy && fileInputRef.current?.click()}
                className={`dropzone hud-well flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-5 text-center transition-all ${isDragging
                    ? 'border-blue-900 bg-blue-50/70 dark:border-[#10B981] dark:bg-[#10B981]/10'
                    : 'border-zinc-300 dark:border-white/15 hover:border-zinc-400 dark:hover:border-white/30'
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
                        {(status === 'success' || Boolean(result)) && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-blue-900/30 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-950 dark:border-[#10B981]/40 dark:bg-[#10B981]/15 dark:text-[#4ADE80]">
                            <Check className="h-2.5 w-2.5 text-blue-900 dark:text-[#4ADE80]" />
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
                        setDuplicateFileInfo(null);
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
                    <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full border border-blue-900/30 bg-blue-50 dark:border-[#10B981]/40 dark:bg-[#10B981]/15">
                      <Upload className="h-5 w-5 text-blue-950 dark:text-[#10B981]" />
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

              {renderShareControls({
                scopeId: 'upload-form',
                settings: formSettings,
                onUpdate: updateFormSettings,
                disabled: isBusy,
                recipientLookupStatus: formLookupStatus,
                onLookupRecipient: handleFormLookupRecipient,
                showPwd: showFormPassword,
                onToggleShowPwd: () => setShowFormPassword((p) => !p),
              })}

              {error && (
                <div className="error-banner flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-900/30 bg-blue-50/90 p-3 text-xs text-blue-950 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-900 dark:text-red-400" />
                    <span>{error}</span>
                  </div>
                  {duplicateFileInfo && (
                    <button
                      type="button"
                      onClick={handleOpenExistingFile}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-blue-900/40 bg-blue-100/80 px-3 py-1.5 font-mono text-xs font-semibold text-blue-950 transition-colors hover:bg-blue-200/80 dark:border-[#10B981]/50 dark:bg-[#10B981]/15 dark:text-[#4ADE80] dark:hover:bg-[#10B981]/25"
                    >
                      <span>Open Existing File</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Always shows Upload File (never turns into Encrypt & Share) */}
              <button
                type="submit"
                disabled={isBusy || !file}
                className="btn-upload inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 hover:bg-black dark:bg-[#10B981] dark:hover:bg-[#059669] px-5 py-3 font-mono text-sm font-semibold tracking-wide text-white shadow-md dark:shadow-emerald-500/25 transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>
                  {status === 'encrypting'
                    ? 'Encrypting...'
                    : status === 'uploading'
                      ? 'Uploading...'
                      : 'Upload File'}
                </span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleNoteSubmit} className="space-y-4">
              <div className="secret-note-editor">
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="vaultx-secret-note" className="font-mono text-xs font-medium text-zinc-600 dark:text-[#A1A1AA]">
                    Secret Text Payload
                  </label>
                  <span className="font-mono text-xs text-zinc-500 dark:text-[#71717A]">
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
                  className="secret-note-textarea hud-well w-full rounded-xl border border-zinc-200 dark:border-white/10 p-3.5 font-mono text-sm text-zinc-900 dark:text-[#FAFAFA] placeholder-zinc-400 dark:placeholder-[#71717A] focus:border-blue-950 dark:focus:border-[#10B981] focus:outline-none"
                />
              </div>

              {renderShareControls({
                scopeId: 'note-form',
                settings: formSettings,
                onUpdate: updateFormSettings,
                disabled: isBusy,
                recipientLookupStatus: formLookupStatus,
                onLookupRecipient: handleFormLookupRecipient,
                showPwd: showFormPassword,
                onToggleShowPwd: () => setShowFormPassword((p) => !p),
              })}

              {error && (
                <div className="error-banner flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-900/30 bg-blue-50/90 p-3 text-xs text-blue-950 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-900 dark:text-red-400" />
                    <span>{error}</span>
                  </div>
                  {duplicateFileInfo && (
                    <button
                      type="button"
                      onClick={handleOpenExistingFile}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-blue-900/40 bg-blue-100/80 px-3 py-1.5 font-mono text-xs font-semibold text-blue-950 transition-colors hover:bg-blue-200/80 dark:border-[#10B981]/50 dark:bg-[#10B981]/15 dark:text-[#4ADE80] dark:hover:bg-[#10B981]/25"
                    >
                      <span>Open Existing File</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={
                    isBusy ||
                    !textNote.trim() ||
                    (mode === 'MODE_A' && !recipientUsername.trim()) ||
                    (isPasswordProtected && !password)
                  }
                  className="btn-upload inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 hover:bg-black dark:bg-[#10B981] dark:hover:bg-[#059669] px-5 py-3 font-mono text-sm font-semibold tracking-wide text-white shadow-md dark:shadow-emerald-500/25 transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  <Lock className="h-4 w-4" />
                  <span>
                    {status === 'encrypting'
                      ? 'Encrypting...'
                      : status === 'uploading'
                        ? 'Uploading...'
                        : status === 'success'
                          ? 'Encrypted & Shared'
                          : status === 'error'
                            ? 'Retry Encrypt & Share'
                            : 'Encrypt & Share'}
                  </span>
                </button>

                {(status === 'success' || status === 'error') && (
                  <button
                    type="button"
                    onClick={handleResetNote}
                    className="btn-reset inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-white/10 bg-zinc-100 dark:bg-white/5 px-4 py-3 font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              {status === 'success' && result && renderShareOutput(result)}
            </form>
          )}
        </div>
      </TerminalWindow>

      {/* Recent Files (Latest 3 Uploaded Files) */}
      {tab === 'file' && recentFiles.length > 0 && (
        <TerminalWindow>
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-2.5">
              <div>
                <h2 className="font-mono text-sm font-semibold text-zinc-900 dark:text-[#FAFAFA]">
                  Recent Files
                </h2>
                <p className="text-xs text-zinc-500 dark:text-[#71717A]">
                  Click a file card to configure its independent settings and generate share links.
                </p>
              </div>
              <Link
                href="/dashboard"
                className="font-mono text-xs font-semibold text-blue-950 hover:underline dark:text-[#10B981] dark:hover:text-[#4ADE80]"
              >
                View All &rarr;
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {recentFiles.slice(0, 3).map((item) => {
                const itemId = item.fileId || item.id;
                const isSelected = itemId === selectedFileCardId;
                return (
                  <button
                    key={itemId}
                    type="button"
                    onClick={() => setSelectedFileCardId(isSelected ? null : itemId)}
                    className={`group flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${isSelected
                        ? 'border-blue-900 bg-blue-50/70 shadow-sm dark:border-[#10B981] dark:bg-[#10B981]/10 dark:shadow-[0_0_20px_-5px_rgba(16,185,129,0.25)]'
                        : 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#07080B] hover:border-zinc-300 dark:hover:border-white/25'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0B0C10]">
                        <FileIcon className="h-4 w-4 text-blue-950 dark:text-[#10B981]" />
                      </div>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${item.status === 'SHARED'
                            ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-[#10B981]/40 dark:bg-[#10B981]/15 dark:text-[#4ADE80]'
                            : 'border-zinc-300 dark:border-white/15 bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300'
                          }`}
                      >
                        {item.status || 'UPLOADED'}
                      </span>
                    </div>

                    <div className="mt-3 min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-[#FAFAFA]">
                        {item.filename || 'Encrypted File'}
                      </p>
                      <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-zinc-500 dark:text-[#71717A]">
                        <span>{formatBytes(item.sizeBytes || 0)}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(item.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between border-t border-zinc-200 dark:border-white/10 pt-2 font-mono text-[11px] text-blue-950 font-semibold dark:text-[#10B981]">
                      <span>{isSelected ? 'Configuring...' : 'Configure & Share'}</span>
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected File Details & Isolated Share Settings */}
            {selectedFileCard && activeCardSettings && (
              <div className="mt-4 space-y-4 rounded-xl border border-blue-900/30 bg-blue-50/30 dark:border-[#10B981]/30 dark:bg-[#050508]/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-white/10 pb-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-bold text-zinc-900 dark:text-[#FAFAFA]">
                      {selectedFileCard.filename}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-500 dark:text-[#71717A]">
                      {formatBytes(selectedFileCard.sizeBytes || 0)} &bull; Uploaded {formatDate(selectedFileCard.createdAt)} &bull; ID: {activeCardId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFileCardId(null)}
                    className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-900 dark:hover:text-[#FAFAFA]"
                    aria-label="Close file details"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {renderShareControls({
                  scopeId: `card-${activeCardId}`,
                  settings: activeCardSettings,
                  onUpdate: (patch) => updateCardSettings(activeCardId, patch),
                  disabled: isSharing,
                  recipientLookupStatus: cardLookupStatusMap[activeCardId] || '',
                  onLookupRecipient: () =>
                    handleCardLookupRecipient(activeCardId, activeCardSettings.recipientUsername),
                  showPwd: Boolean(cardShowPasswordMap[activeCardId]),
                  onToggleShowPwd: () =>
                    setCardShowPasswordMap((prev) => ({
                      ...prev,
                      [activeCardId]: !prev[activeCardId],
                    })),
                })}

                {activeShareError && (
                  <div className="flex items-start gap-2 rounded-lg border border-blue-900/30 bg-blue-50/90 p-3 text-xs text-blue-950 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-900 dark:text-red-400" />
                    <span>{activeShareError}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleShareSelectedFile}
                  disabled={
                    isSharing ||
                    (activeCardSettings.mode === 'MODE_A' &&
                      !activeCardSettings.recipientUsername.trim()) ||
                    (activeCardSettings.isPasswordProtected && !activeCardSettings.password)
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 hover:bg-black dark:bg-[#10B981] dark:hover:bg-[#059669] px-5 py-3 font-mono text-sm font-semibold tracking-wide text-white shadow-md dark:shadow-emerald-500/25 transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  {isSharing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  <span>{isSharing ? 'Generating Share Link...' : 'Encrypt & Share'}</span>
                </button>

                {activeShareStatus === 'success' &&
                  activeShareResult &&
                  renderShareOutput(activeShareResult, generatedLinksMap[activeCardId] || [])}
              </div>
            )}
          </div>
        </TerminalWindow>
      )}

      <QRModal
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        shareUrl={qrUrl || result?.fullShareUrl || ''}
      />
    </section>
  );
}

export default UploadCard;
