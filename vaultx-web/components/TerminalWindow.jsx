'use client';

import React from 'react';

/**
 * TerminalWindow
 * Matte charcoal (#0B0C10) glass card with razor-thin border-white/10
 * and subtle Cyber Green + Tactical Crimson ambient underglow.
 */
export function TerminalWindow({
  className = '',
  children,
}) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-[#0B0C10]/90 backdrop-blur-xl shadow-[0_0_80px_-20px_rgba(16,185,129,0.20),0_0_50px_-15px_rgba(239,68,68,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export default TerminalWindow;
