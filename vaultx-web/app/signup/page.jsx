'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  UserPlus,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { TerminalWindow } from '../../components/TerminalWindow.jsx';
import { ThemeToggle } from '../../components/ThemeToggle.jsx';
import { useAuth } from '../../lib/authContext.js';

/**
 * SignUpPage (/signup)
 * VaultX registration page — Obsidian Black + Cyber Green + Tactical Crimson
 * design language matching the login, upload, and dashboard pages.
 */
export default function SignUpPage() {
  const router = useRouter();
  const { user, signUp } = useAuth();

  // ── form state ──
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── validation state ──
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  // ── async state ──
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  // ── validation helpers ──
  const validateName = (value) => {
    if (!value.trim()) return 'Name is required';
    if (value.trim().length < 2) return 'Name must be at least 2 characters';
    return '';
  };

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

  const validateConfirmPassword = (value, pwd) => {
    if (!value) return 'Please confirm your password';
    if (value !== pwd) return 'Passwords do not match';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const nErr = validateName(name);
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    const cErr = validateConfirmPassword(confirmPassword, password);

    setNameError(nErr);
    setEmailError(eErr);
    setPasswordError(pErr);
    setConfirmPasswordError(cErr);

    if (nErr || eErr || pErr || cErr) return;

    setServerError('');
    setIsSubmitting(true);

    try {
      const result = await signUp({ name, email, password });
      if (result.success) {
        router.push('/dashboard');
      } else {
        setServerError(result.error || 'Registration failed');
      }
    } catch (err) {
      setServerError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user) return null;

  return (
    <div className="relative min-h-screen text-zinc-900 dark:text-[#FAFAFA] transition-colors duration-150">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 dark:border-white/10 dark:bg-[#050508]/85 backdrop-blur-xl transition-colors duration-150">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-900 bg-zinc-900 text-white dark:border-red-500/40 dark:bg-red-500/10 dark:text-[#EF4444] transition-colors group-hover:opacity-90">
              <Shield className="h-4 w-4" />
            </div>
            <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-[#FAFAFA]">
              VAULTX
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/10"
            >
              Home
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 mx-auto flex max-w-md flex-col items-center px-4 pt-10 pb-16 sm:pt-14">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-900 bg-zinc-900 text-white dark:border-red-500/40 dark:bg-red-500/10 dark:text-[#EF4444] shadow-md dark:shadow-[0_0_30px_-8px_rgba(239,68,68,0.3)]">
            <Shield className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#FAFAFA] sm:text-3xl">
              Create VaultX Account
            </h1>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-[#A1A1AA]">
              Set up your zero-knowledge encrypted workspace
            </p>
          </div>
        </div>

        {/* ── Registration Card ── */}
        <TerminalWindow className="w-full">
          <div className="p-5 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* ── Name ── */}
              <div>
                <label
                  htmlFor="vaultx-signup-name"
                  className="mb-1.5 block font-mono text-xs font-medium text-zinc-700 dark:text-[#71717A]"
                >
                  Full Name
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-[#71717A]">
                    <User className="h-4 w-4" />
                  </span>
                  <input
                    id="vaultx-signup-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (nameError) setNameError('');
                      if (serverError) setServerError('');
                    }}
                    onBlur={() => setNameError(validateName(name))}
                    disabled={isSubmitting}
                    placeholder="Alex Mercer"
                    autoComplete="name"
                    className={`w-full rounded-md border py-2 pl-10 pr-3 font-mono text-sm transition-colors focus:outline-none border-zinc-300 bg-white text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 dark:hud-well dark:text-[#FAFAFA] dark:placeholder-[#71717A] ${
                      nameError
                        ? '!border-red-500/60 focus:!border-red-500'
                        : 'dark:border-white/10 dark:focus:border-[#10B981]'
                    }`}
                  />
                </div>
                {nameError && (
                  <p className="mt-1 font-mono text-xs text-red-500 dark:text-red-400">{nameError}</p>
                )}
              </div>

              {/* ── Email ── */}
              <div>
                <label
                  htmlFor="vaultx-signup-email"
                  className="mb-1.5 block font-mono text-xs font-medium text-zinc-700 dark:text-[#71717A]"
                >
                  Email Address
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-[#71717A]">
                    <Mail className="h-4 w-4" />
                  </span>
                  <input
                    id="vaultx-signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError('');
                      if (serverError) setServerError('');
                    }}
                    onBlur={() => setEmailError(validateEmail(email))}
                    disabled={isSubmitting}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className={`w-full rounded-md border py-2 pl-10 pr-3 font-mono text-sm transition-colors focus:outline-none border-zinc-300 bg-white text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 dark:hud-well dark:text-[#FAFAFA] dark:placeholder-[#71717A] ${
                      emailError
                        ? '!border-red-500/60 focus:!border-red-500'
                        : 'dark:border-white/10 dark:focus:border-[#10B981]'
                    }`}
                  />
                </div>
                {emailError && (
                  <p className="mt-1 font-mono text-xs text-red-500 dark:text-red-400">{emailError}</p>
                )}
              </div>

              {/* ── Password ── */}
              <div>
                <label
                  htmlFor="vaultx-signup-password"
                  className="mb-1.5 block font-mono text-xs font-medium text-zinc-700 dark:text-[#71717A]"
                >
                  Password
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-[#71717A]">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    id="vaultx-signup-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                      if (confirmPasswordError && confirmPassword) {
                        setConfirmPasswordError(
                          validateConfirmPassword(confirmPassword, e.target.value)
                        );
                      }
                      if (serverError) setServerError('');
                    }}
                    onBlur={() => setPasswordError(validatePassword(password))}
                    disabled={isSubmitting}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    className={`w-full rounded-md border py-2 pl-10 pr-10 font-mono text-sm transition-colors focus:outline-none border-zinc-300 bg-white text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 dark:hud-well dark:text-[#FAFAFA] dark:placeholder-[#71717A] ${
                      passwordError
                        ? '!border-red-500/60 focus:!border-red-500'
                        : 'dark:border-white/10 dark:focus:border-[#10B981]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-900 dark:text-[#71717A] dark:hover:text-[#FAFAFA] transition-colors focus:outline-none"
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
                  <p className="mt-1 font-mono text-xs text-red-500 dark:text-red-400">{passwordError}</p>
                )}
              </div>

              {/* ── Confirm Password ── */}
              <div>
                <label
                  htmlFor="vaultx-signup-confirm"
                  className="mb-1.5 block font-mono text-xs font-medium text-zinc-700 dark:text-[#71717A]"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-[#71717A]">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    id="vaultx-signup-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (confirmPasswordError) setConfirmPasswordError('');
                      if (serverError) setServerError('');
                    }}
                    onBlur={() =>
                      setConfirmPasswordError(validateConfirmPassword(confirmPassword, password))
                    }
                    disabled={isSubmitting}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    className={`w-full rounded-md border py-2 pl-10 pr-10 font-mono text-sm transition-colors focus:outline-none border-zinc-300 bg-white text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 dark:hud-well dark:text-[#FAFAFA] dark:placeholder-[#71717A] ${
                      confirmPasswordError
                        ? '!border-red-500/60 focus:!border-red-500'
                        : 'dark:border-white/10 dark:focus:border-[#10B981]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isSubmitting}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-900 dark:text-[#71717A] dark:hover:text-[#FAFAFA] transition-colors focus:outline-none"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {confirmPasswordError && (
                  <p className="mt-1 font-mono text-xs text-red-500 dark:text-red-400">{confirmPasswordError}</p>
                )}
              </div>

              {/* ── Server Error ── */}
              {serverError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 dark:text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}

              {/* ── Create Account Button ── */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 text-white hover:bg-black shadow-md dark:bg-[#10B981] dark:shadow-emerald-500/25 dark:hover:bg-[#059669] px-5 py-3 font-mono text-sm font-semibold tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating Account…</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    <span>Sign Up</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* ── Footer — Sign In link ── */}
          <div className="border-t border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-[#07080B] px-5 py-3.5 text-center">
            <p className="text-xs text-zinc-600 dark:text-[#A1A1AA]">
              Already have an account?{' '}
              <Link
                href="/login"
                className="font-mono font-medium text-zinc-900 underline hover:text-black dark:text-[#10B981] dark:hover:text-[#4ADE80] transition-colors"
              >
                Sign In
              </Link>
            </p>
          </div>
        </TerminalWindow>
      </main>
    </div>
  );
}
