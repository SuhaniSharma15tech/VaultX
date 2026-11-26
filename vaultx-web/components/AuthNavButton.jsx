'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut } from 'lucide-react';
import { useAuth } from '../lib/authContext.js';

/**
 * AuthNavButton
 * Renders a Login link when logged out, or a Logout button when authenticated.
 * On Logout, clears the session and redirects to /login.
 */
export function AuthNavButton({ variant = 'primary', mono = false }) {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const fontClass = mono ? 'font-mono ' : '';

  const handleLogout = () => {
    signOut();
    router.push('/login');
  };

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className={`hidden text-xs text-zinc-600 dark:text-zinc-400 sm:inline ${fontClass}`}>
          {user.name || user.email}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className={`inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 ${fontClass}text-xs font-medium text-zinc-700 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400 dark:hover:border-red-500/60 dark:hover:bg-red-500/20`}
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Logout</span>
        </button>
      </div>
    );
  }

  if (variant === 'outline') {
    return (
      <Link
        href="/login"
        className={`inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 ${fontClass}text-xs font-medium text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/10`}
      >
        <LogIn className="h-3.5 w-3.5 text-zinc-500 dark:text-[#A1A1AA]" />
        <span>Sign In</span>
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className={`inline-flex items-center gap-1.5 rounded-md border border-zinc-900 bg-zinc-900 px-3.5 py-1.5 ${fontClass}text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 dark:border-emerald-500/30 dark:bg-[#10B981] dark:shadow-lg dark:shadow-emerald-500/25 dark:hover:bg-[#059669]`}
    >
      <LogIn className="h-3.5 w-3.5" />
      <span>Sign In</span>
    </Link>
  );
}

export default AuthNavButton;
