'use client';

import React from 'react';

/**
 * CyberBackdrop
 * Responsive background canvas:
 * - In Dark Theme: Pitch-black (#050508) canvas with dark tactical aura, ambient grid, and subtle 3D perspective grid.
 * - In Light Theme: Clean Pure White (#FFFFFF) background with subtle monochrome charcoal & grey grid and glow.
 */
export function CyberBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-white dark:bg-[#050508] select-none transition-colors duration-150"
    >
      {/* Top ambient horizon glow */}
      {/* Dark theme: Cyber Green + Crimson horizon */}
      <div className="hidden dark:block absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.20),rgba(220,38,38,0.16),#050508_70%)]" />
      {/* Light theme: Crisp charcoal, midnight & deep blue radial aura fading to white */}
      <div className="block dark:hidden absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(15,23,42,0.08),rgba(30,58,138,0.06),#FFFFFF_70%)]" />

      {/* Full-canvas Ambient Grid */}
      <div className="cyber-canvas-grid absolute inset-0 opacity-70 dark:opacity-85" />

      {/* Radially spinning ambient aura */}
      <div className="spin-radial-glow absolute left-1/2 top-[38%] h-[1050px] w-[1050px] rounded-full blur-3xl opacity-50 dark:opacity-75" />
      <div className="hidden dark:block absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,transparent_15%,#050508_74%)]" />
      <div className="block dark:hidden absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,transparent_20%,#FFFFFF_80%)]" />

      {/* 3D Perspective Grid along bottom edge */}
      <div className="perspective-stage absolute inset-x-0 bottom-0 h-[220px]">
        <div className="perspective-grid" />
      </div>
    </div>
  );
}

export default CyberBackdrop;
