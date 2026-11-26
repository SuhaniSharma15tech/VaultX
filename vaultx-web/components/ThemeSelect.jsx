'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * ThemeSelect
 * Matte charcoal (#0B0C10) glassmorphic dropdown matching the Obsidian,
 * Cyber Green (#10B981), and Crimson identity.
 */
export function ThemeSelect({
  id,
  value,
  onChange,
  options = [],
  disabled = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`ttl-select flex w-full items-center justify-between rounded-md border px-3 py-1.5 font-mono text-sm transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 border-zinc-300 bg-zinc-50 text-zinc-900 hover:border-zinc-400 dark:border-white/10 dark:bg-[#0B0C10] dark:text-[#FAFAFA] dark:hover:border-white/20 ${isOpen
          ? 'border-zinc-900 dark:border-[#10B981] dark:shadow-[0_0_16px_rgba(16,185,129,0.25)]'
          : ''
          }`}
      >
        <span>{selectedOption ? selectedOption.label : ''}</span>
        <ChevronDown
          className={`h-4 w-4 text-zinc-500 dark:text-[#71717A] transition-transform duration-150 ${isOpen ? 'rotate-180 text-zinc-900 dark:text-[#10B981]' : ''
            }`}
        />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          aria-labelledby={id}
          className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 backdrop-blur-xl shadow-2xl dark:border-white/10 dark:bg-[#0B0C10]/95 dark:shadow-[0_16px_40px_rgba(0,0,0,0.95)]"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left font-mono text-xs transition-colors ${isSelected
                    ? 'bg-zinc-100 text-zinc-900 font-semibold border-l-2 border-zinc-900 dark:bg-[#10B981]/20 dark:text-white dark:border-[#10B981]'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-[#A1A1AA] dark:hover:bg-white/5 dark:hover:text-[#FAFAFA]'
                    }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-zinc-900 dark:text-[#10B981]" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ThemeSelect;
