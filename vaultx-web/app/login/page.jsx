'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  Loader2,
  UserRound,
} from 'lucide-react';
import { TerminalWindow } from '../../components/TerminalWindow.jsx';
import { useAuth } from '../../lib/authContext.js';

/**
 * LoginPage (/login)
 * VaultX authentication gate — Obsidian Black + Cyber Green + Tactical Crimson
 * design language matching the existing upload and dashboard pages.
 */
export default function LoginPage() {
  const router = useRouter();
  const { user, signIn, continueAsGuest } = useAuth();

  // ── form state ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // ── validation state ──
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // ── async state ──
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  // ── validation helpers ──
  const validateEmail = (value) => {
    if (!value.trim()) return 'Email address is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Enter a valid email address';
    return '';
  };

  const validatePassword = (value) => {
    if (!value) return 'Password is required';
    if (value.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  const handleEmailBlur = () => setEmailError(validateEmail(email));
  const handlePasswordBlur = () => setPasswordError(validatePassword(password));

  // ── submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();

    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

    setServerError('');
    setIsSubmitting(true);

    try {
      const result = await signIn({ email, password, remember: rememberMe });
      if (result.success) {
        router.push('/dashboard');
      } else {
        setServerError(result.error || 'Authentication failed');
      }
    } catch (err) {
      setServerError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── guest shortcut ──
  const handleGuest = () => {
    continueAsGuest();
    router.push('/dashboard');
  };

  // Don't flash the form while redirecting
  if (user) return null;

  return (
    <div className="relative min-h-screen text-[#FAFAFA]">
      {/* ── Header (same pattern as home / dashboard) ── */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#050508]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 transition-colors group-hover:border-red-500/60">
              <Shield className="h-4 w-4 text-[#EF4444]" />
            </div>
            <span className="text-base font-bold tracking-tight text-[#FAFAFA]">
              VAULTX
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/10"
            >
              Home
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 mx-auto flex max-w-md flex-col items-center px-4 pt-12 pb-16 sm:pt-16">
        {/* Logo / branding mark */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/40 bg-red-500/10 shadow-[0_0_30px_-8px_rgba(239,68,68,0.3)]">
            <Shield className="h-7 w-7 text-[#EF4444]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#FAFAFA] sm:text-3xl">
              Sign In to VaultX
            </h1>
            <p className="mt-1.5 text-sm text-[#A1A1AA]">
              Access your zero-knowledge encrypted vaults
            </p>
          </div>
        </div>

        {/* ── Login Card ── */}
        <TerminalWindow className="w-full">
          <div className="p-5 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* ── Email ── */}
              <div>
                <label
                  htmlFor="vaultx-login-email"
                  className="mb-1.5 block font-mono text-xs font-medium text-[#71717A]"
                >
                  Email Address
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]">
                    <Mail className="h-4 w-4" />
                  </span>
                  <input
                    id="vaultx-login-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError('');
                      if (serverError) setServerError('');
                    }}
                    onBlur={handleEmailBlur}
                    disabled={isSubmitting}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className={`hud-well w-full rounded-md border py-2 pl-10 pr-3 font-mono text-sm text-[#FAFAFA] placeholder-[#71717A] transition-colors focus:outline-none ${
                      emailError
                        ? 'border-red-500/60 focus:border-red-500'
                        : 'border-white/10 focus:border-[#10B981]'
                    }`}
                  />
                </div>
                {emailError && (
                  <p className="mt-1 font-mono text-xs text-red-400">{emailError}</p>
                )}
              </div>

              {/* ── Password ── */}
              <div>
                <label
                  htmlFor="vaultx-login-password"
                  className="mb-1.5 block font-mono text-xs font-medium text-[#71717A]"
                >
                  Password
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    id="vaultx-login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                      if (serverError) setServerError('');
                    }}
                    onBlur={handlePasswordBlur}
                    disabled={isSubmitting}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className={`hud-well w-full rounded-md border py-2 pl-10 pr-10 font-mono text-sm text-[#FAFAFA] placeholder-[#71717A] transition-colors focus:outline-none ${
                      passwordError
                        ? 'border-red-500/60 focus:border-red-500'
                        : 'border-white/10 focus:border-[#10B981]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#71717A] transition-colors hover:text-[#FAFAFA] focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {passwordError && (
                  <p className="mt-1 font-mono text-xs text-red-400">{passwordError}</p>
                )}
              </div>

              {/* ── Remember Me / Forgot Password ── */}
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[#A1A1AA]">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isSubmitting}
                    className="h-3.5 w-3.5 rounded border-white/20 bg-[#050508] accent-[#10B981]"
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  className="font-mono text-xs font-medium text-[#10B981] transition-colors hover:text-[#4ADE80]"
                  onClick={() =>
                    alert(
                      'Password reset is not available in this demo.\n\nTry: demo@vaultx.io / demo1234'
                    )
                  }
                >
                  Forgot password?
                </button>
              </div>

              {/* ── Server Error ── */}
              {serverError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}

              {/* ── Sign In Button ── */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#10B981] px-5 py-3 font-mono text-sm font-semibold tracking-wide text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Authenticating…</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>

            {/* ── Divider ── */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#71717A]">
                or
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* ── Continue as Guest ── */}
            <button
              type="button"
              onClick={handleGuest}
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 font-mono text-xs font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/10"
            >
              <UserRound className="h-4 w-4 text-[#A1A1AA]" />
              <span>Continue as Guest</span>
            </button>
          </div>

          {/* ── Footer — Sign Up link ── */}
          <div className="border-t border-white/10 bg-[#07080B] px-5 py-3.5 text-center">
            <p className="text-xs text-[#A1A1AA]">
              Don&apos;t have an account?{' '}
              <Link
                href="/signup"
                className="font-mono font-medium text-[#10B981] transition-colors hover:text-[#4ADE80]"
              >
                Sign Up
              </Link>
            </p>
          </div>
        </TerminalWindow>
      </main>
    </div>
  );
}
