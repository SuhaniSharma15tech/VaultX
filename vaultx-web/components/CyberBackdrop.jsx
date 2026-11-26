'use client';

import React from 'react';

/**
 * CyberBackdrop
 * Pitch-black (#050508) canvas with a top Cyber Green (#10B981/18) + Tactical Crimson (#DC2626/16)
 * horizon glow, radially spinning ambient aura, and subtle bottom perspective grid.
 */
export function CyberBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050508] select-none"
    >
      {/* Top ambient horizon glow: Cyber Green + Crimson blending into #050508 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.20),rgba(220,38,38,0.16),#050508_70%)]" />

      {/* Full-canvas Ambient Cyber Grid: Cyber Green vertical lines + Tactical Red horizontal lines */}
      <div className="cyber-canvas-grid absolute inset-0 opacity-85" />

      {/* Radially spinning Cyber Green & Tactical Red ambient conic aura */}
      <div className="spin-radial-glow absolute left-1/2 top-[38%] h-[1050px] w-[1050px] rounded-full blur-3xl opacity-75" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,transparent_15%,#050508_74%)]" />

      {/* 3D Perspective Grid along bottom edge in Green and Red */}
      <div className="perspective-stage absolute inset-x-0 bottom-0 h-[220px]">
        <div className="perspective-grid" />
      </div>
    </div>
  );
}

export default CyberBackdrop;
