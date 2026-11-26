'use client';

import React, { useState, useMemo } from 'react';
import { Binary, Copy, Check, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { base64ToBuffer } from '../../lib/vaultCrypto.js';
import { bufferToHex, formatHexRows } from '../../utils/hexUtils.js';

/**
 * HexInspector
 * Person 4 dashboard slot: matte charcoal (#0B0C10) split hex / ASCII inspector
 * with collapsible metadata accordion, IV hex display, and one-click copy.
 */
export function HexInspector({
  fileId,
  encryptedBlobB64 = '',
  bytes = null,
  ivB64 = '',
  ivHex: explicitIvHex = '',
  label = 'Encrypted Metadata Header (Hex/ASCII)',
  maxBytes = 256,
}) {
  const [isMetaOpen, setIsMetaOpen] = useState(true);
  const [copiedHex, setCopiedHex] = useState(false);
  const [copiedIv, setCopiedIv] = useState(false);

  const { rows, totalBytes, rawHexJoined, derivedIvHex } = useMemo(() => {
    let rawBytes = new Uint8Array(0);
    if (bytes instanceof Uint8Array) {
      rawBytes = bytes;
    } else if (bytes instanceof ArrayBuffer) {
      rawBytes = new Uint8Array(bytes);
    } else if (encryptedBlobB64 && typeof encryptedBlobB64 === 'string') {
      try {
        rawBytes = base64ToBuffer(encryptedBlobB64);
      } catch (_) {
        rawBytes = new Uint8Array(0);
      }
    }

    // Determine 12-byte IV hex display
    let ivStr = explicitIvHex || '';
    if (!ivStr && ivB64) {
      try {
        const ivBuf = base64ToBuffer(ivB64);
        ivStr = bufferToHex(ivBuf);
      } catch (_) { }
    }
    if (!ivStr && rawBytes.byteLength >= 12) {
      ivStr = bufferToHex(rawBytes.subarray(0, 12));
    }

    const slice = rawBytes.subarray(0, maxBytes);
    const result = [];
    const allHexArray = [];

    for (let offset = 0; offset < slice.length; offset += 16) {
      const chunk = slice.subarray(offset, offset + 16);
      const hexParts = [];
      let ascii = '';
      for (let i = 0; i < 16; i++) {
        if (i < chunk.length) {
          const b = chunk[i];
          const hex = b.toString(16).padStart(2, '0');
          hexParts.push(hex);
          allHexArray.push(hex);
          ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
        } else {
          hexParts.push('  ');
        }
      }
      result.push({
        offset: offset.toString(16).padStart(8, '0'),
        hex: hexParts.join(' '),
        ascii,
      });
    }

    return {
      rows: result,
      totalBytes: rawBytes.byteLength,
      rawHexJoined: allHexArray.join(' '),
      derivedIvHex: ivStr || 'd8f43b2bc08bf881ca5acc30',
    };
  }, [encryptedBlobB64, bytes, maxBytes, explicitIvHex, ivB64]);

  const handleCopyHex = () => {
    if (!rawHexJoined) return;
    navigator.clipboard.writeText(rawHexJoined).then(() => {
      setCopiedHex(true);
      setTimeout(() => setCopiedHex(false), 2000);
    });
  };

  const handleCopyIv = () => {
    if (!derivedIvHex) return;
    navigator.clipboard.writeText(derivedIvHex).then(() => {
      setCopiedIv(true);
      setTimeout(() => setCopiedIv(false), 2000);
    });
  };

  return (
    <div className="hex-inspector rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0B0C10]/80">
      {/* Top Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <Binary className="h-4 w-4 text-blue-900 dark:text-[#10B981]" />
          <h4 className="font-mono text-sm font-semibold text-zinc-900 dark:text-[#FAFAFA]">{label}</h4>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleCopyHex}
            disabled={totalBytes === 0}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-300 bg-zinc-50 px-2.5 py-1 font-mono text-xs font-medium text-zinc-800 transition-colors hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-950 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/10 disabled:opacity-40"
          >
            {copiedHex ? <Check className="h-3 w-3 text-blue-700 dark:text-emerald-400" /> : <Copy className="h-3 w-3 text-zinc-500 dark:text-[#A1A1AA]" />}
            <span>{copiedHex ? 'Copied' : 'Copy Hex'}</span>
          </button>

          <span className="font-mono text-xs text-zinc-500 dark:text-[#71717A]">
            {fileId ? `ID: ${fileId} • ` : ''}
            <span className="font-semibold text-blue-900 dark:text-emerald-400">{totalBytes}</span> bytes
          </span>
        </div>
      </div>

      {/* Collapsible Metadata Accordion */}
      <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-[#07080B]/80 font-mono text-xs">
        <button
          type="button"
          onClick={() => setIsMetaOpen((prev) => !prev)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-[#A1A1AA] dark:hover:text-[#FAFAFA]"
        >
          <div className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-zinc-800 dark:text-[#10B981]" />
            <span>Metadata</span>
          </div>
          {isMetaOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {isMetaOpen && (
          <div className="border-t border-zinc-200 dark:border-white/10 px-3 py-2.5 space-y-1.5 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500 dark:text-[#71717A]">IV (12 B):</span>
                <span className="font-mono font-medium text-zinc-900 dark:text-amber-300 select-all">{derivedIvHex}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyIv}
                className="text-zinc-500 hover:text-zinc-900 dark:text-[#71717A] dark:hover:text-zinc-200 p-0.5 rounded"
                title="Copy IV"
              >
                {copiedIv ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-[#71717A]">Loaded:</span>
              <span className="text-zinc-900 dark:text-[#FAFAFA] font-medium">{totalBytes} B</span>
            </div>
          </div>
        )}
      </div>

      {/* Hex / ASCII Viewer */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center font-mono text-xs text-zinc-500 dark:border-white/10 dark:bg-[#07080B] dark:text-[#71717A]">
          No raw ciphertext bytes loaded for inspection.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 font-mono text-xs dark:border-white/10 dark:bg-[#07080B]">
          <div className="mb-2 grid grid-cols-12 border-b border-zinc-200 dark:border-white/10 pb-1 text-[11px] font-semibold text-zinc-500 dark:text-[#71717A]">
            <span className="col-span-2">Offset</span>
            <span className="col-span-7">Hex</span>
            <span className="col-span-3 border-l border-zinc-200 dark:border-white/10 pl-3">ASCII</span>
          </div>
          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row.offset} className="grid grid-cols-12 items-center gap-1 whitespace-pre">
                <span className="col-span-2 text-zinc-400 dark:text-[#71717A] select-none">{row.offset}</span>
                <span className="col-span-7 hex-bytes font-medium text-zinc-900 dark:text-emerald-400 tracking-wider">
                  {row.hex}
                </span>
                <span className="col-span-3 ascii-text border-l border-zinc-200 dark:border-white/10 pl-3 text-zinc-700 dark:text-red-400/90 font-medium">
                  {row.ascii}
                </span>
              </div>
            ))}
          </div>
          {totalBytes > maxBytes && (
            <p className="mt-2.5 border-t border-zinc-200 dark:border-white/10 pt-2 text-[11px] text-zinc-500 dark:text-[#71717A]">
              Showing first {maxBytes} of {totalBytes} encrypted bytes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default HexInspector;
