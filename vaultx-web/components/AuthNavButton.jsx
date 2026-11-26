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
      <button
        type="button"
        onClick={handleLogout}
        className={`inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 ${fontClass}text-xs font-medium text-red-400 transition-colors hover:border-red-500/60 hover:bg-red-500/20`}
      >
        <LogOut className="h-3.5 w-3.5" />
        <span>Logout</span>
      </button>
    );
  }

  if (variant === 'outline') {
    return (
      <Link
        href="/login"
        className={`inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 ${fontClass}text-xs font-medium text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/10`}
      >
        <LogIn className="h-3.5 w-3.5 text-[#A1A1AA]" />
        <span>Login</span>
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className={`inline-flex items-center gap-1.5 rounded-md bg-[#10B981] px-3.5 py-1.5 ${fontClass}text-xs font-semibold text-white shadow-lg shadow-emerald-500/25 transition-colors hover:bg-[#059669]`}
    >
      <LogIn className="h-3.5 w-3.5" />
      <span>Login</span>
    </Link>
  );
}

export default AuthNavButton;
