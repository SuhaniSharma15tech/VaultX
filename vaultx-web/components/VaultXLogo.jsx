'use client';

import React from 'react';
import Image from 'next/image';

/**
 * VaultXLogo
 * Brand emblem symbol representing VaultX with transparent background,
 * dual-theme responsive styling, and subtle tactical glow in dark mode.
 */
export function VaultXLogo({ className = 'h-8 w-8', alt = 'VaultX' }) {
  return (
    <div
      className={`relative flex items-center justify-center shrink-0 rounded-lg p-0.5 transition-transform duration-150 group-hover:scale-105 ${className}`}
    >
      <Image
        src="/vaultx-symbol.png"
        alt={alt}
        width={36}
        height={36}
        priority
        className="h-full w-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.15)] dark:drop-shadow-[0_0_12px_rgba(16,185,129,0.35)]"
      />
    </div>
  );
}

export default VaultXLogo;
