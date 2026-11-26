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
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-white dark:bg-[#050508] select-none transition-colors duration-300 ease-in-out"
    >
      {/* Full-canvas Ambient Grid */}
      <div className="cyber-canvas-grid absolute inset-0 opacity-70 dark:opacity-85 transition-opacity duration-300" />

      {/* Primary Dynamic Rotating Aura (Clockwise) covering full viewport */}
      <div className="spin-radial-clockwise absolute left-1/2 top-1/2 h-[120vmax] w-[120vmax] rounded-full blur-[80px] opacity-80 dark:opacity-75 transition-opacity duration-300" />

      {/* Counter-rotating Secondary Ambient Aura (Anticlockwise) for complex multi-layer flair */}
      <div className="spin-radial-counter absolute left-1/2 top-1/2 h-[110vmax] w-[110vmax] rounded-full blur-[100px] opacity-60 dark:opacity-60 transition-opacity duration-300" />

      {/* Smooth radial vignette mask ensuring content readability and seamless edges */}
      <div className="hidden dark:block absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_20%,#050508_82%)] transition-opacity duration-300" />
      <div className="block dark:hidden absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_25%,#FFFFFF_85%)] transition-opacity duration-300" />

      {/* 3D Perspective Grid along bottom edge */}
      <div className="perspective-stage absolute inset-x-0 bottom-0 h-[220px]">
        <div className="perspective-grid transition-all duration-300" />
      </div>
    </div>
  );
}

export default CyberBackdrop;
