'use client';

import React from 'react';

/**
 * TerminalWindow
 * Card frame with explicit light/dark themes:
 * - Dark: Matte charcoal (#0B0C10) glass card with razor-thin border-white/10 and Cyber Green + Tactical Crimson ambient underglow.
 * - Light: Clean pure white card with subtle grey border, soft shadow, and zero color contamination (monochrome charcoal/grey).
 */
export function TerminalWindow({
  className = '',
  children,
}) {
  return (
    <div
      className={`rounded-xl border transition-colors duration-150 backdrop-blur-xl border-zinc-200 bg-white/95 text-zinc-900 shadow-xl shadow-zinc-900/5 dark:border-white/10 dark:bg-[#0B0C10]/90 dark:text-[#FAFAFA] dark:shadow-[0_0_80px_-20px_rgba(16,185,129,0.20),0_0_50px_-15px_rgba(239,68,68,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export default TerminalWindow;
