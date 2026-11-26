'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider.jsx';

/**
 * ThemeToggle
 * Explicit Dark/Light theme switch.
 * - Dark: Pitch-black background with red/green tactical highlights.
 * - Light: Pure white background with minimalist charcoal/grey/black monochrome aesthetics.
 */
export function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme, mounted } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to Light Theme (Monochrome/White)' : 'Switch to Dark Theme (Obsidian/Tactical)'}
      title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      className={`btn-theme-toggle relative inline-flex h-8 w-8 items-center justify-center rounded-md border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 ${
        isDark
          ? 'border-white/10 bg-white/5 text-amber-400 hover:border-white/20 hover:bg-white/10 hover:text-amber-300'
          : 'border-zinc-300 bg-white text-zinc-800 shadow-sm hover:border-zinc-400 hover:bg-zinc-100 hover:text-black'
      } ${className}`}
    >
      {mounted && isDark ? (
        <Sun className="h-4 w-4 transition-transform duration-200 rotate-0 hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 transition-transform duration-200 rotate-0 hover:-rotate-12" />
      )}
    </button>
  );
}

export default ThemeToggle;
