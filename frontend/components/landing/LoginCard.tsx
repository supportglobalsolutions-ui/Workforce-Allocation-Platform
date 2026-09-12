'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, AlertCircle } from 'lucide-react';
import GlobalSolutionsLogo from './GlobalSolutionsLogo';
import SpinningDots from '@/components/shared/SpinningDots';
import { useAuth } from '@/lib/auth/AuthProvider';
import { setAuthRoleCookie } from '@/lib/auth/cookies';
import { ROLE_LANDING } from '@/lib/navigation/config';

interface LoginCardProps {
  onSuccess?: () => void;
  className?: string;
  isModal?: boolean;
}

const DEFAULT_SUPER_ADMIN_EMAIL =
  process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || 'support.globalsolutions@gmail.com';
const DEFAULT_SUPER_ADMIN_PASSWORD =
  process.env.NEXT_PUBLIC_SUPER_ADMIN_PASSWORD || 'Spectre1+';

export default function LoginCard({ onSuccess, className = '', isModal = false }: LoginCardProps) {
  const { login, session, isLoading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState(DEFAULT_SUPER_ADMIN_EMAIL);
  const [password, setPassword] = useState(DEFAULT_SUPER_ADMIN_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [autofilled, setAutofilled] = useState(true);

  // If already logged in, route to destination
  useEffect(() => {
    if (!session) return;
    setAuthRoleCookie(session.authRole);
    if (onSuccess) {
      onSuccess();
    } else {
      router.replace(ROLE_LANDING[session.primaryPortal]);
    }
  }, [session, router, onSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      if (!result.ok) {
        setError(result.error ?? 'Login failed. Please check credentials.');
      } else {
        if (onSuccess) onSuccess();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const setAdminAccount = (mail: string, pass: string) => {
    setEmail(mail);
    setPassword(pass);
    setAutofilled(true);
    setError('');
  };

  return (
    <div
      className={`relative z-20 w-full max-w-[430px] rounded-3xl p-7 sm:p-9 transition-all
        bg-[#031513]/85 backdrop-blur-2xl
        border border-[#0df5c4]/35 shadow-[0_0_60px_rgba(13,245,196,0.18)]
        text-white ${className}`}
    >
      {/* Glow highlight lines */}
      <div className="absolute top-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-[#0df5c4] to-transparent opacity-70" />
      <div className="absolute -inset-[1px] -z-10 rounded-3xl bg-gradient-to-b from-[#0df5c4]/20 via-transparent to-[#0df5c4]/10 blur-sm pointer-events-none" />

      {/* Card Header matching Image 1 */}
      <div className="flex flex-col items-center text-center mb-6">
        <GlobalSolutionsLogo size="md" showText={false} />
        <h2 className="text-xl sm:text-2xl font-display font-bold text-white mt-3 tracking-tight">
          Global Solutions
        </h2>
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#0df5c4] mt-1">
          REMOTE • SMART • GLOBAL
        </p>

        {/* Autofill Notification Pill */}
        {autofilled && (
          <div className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-[#0df5c4]/10 border border-[#0df5c4]/30 text-[#0df5c4]">
            <Check size={12} className="text-[#0df5c4]" />
            <span>Super Admin prefilled</span>
            <span className="text-white/40">|</span>
            <button
              type="button"
              onClick={() =>
                setAdminAccount('peterkelvinkibiru1532@gmail.com', DEFAULT_SUPER_ADMIN_PASSWORD)
              }
              className="text-[10px] text-white/70 hover:text-white underline transition-colors"
            >
              alternate
            </button>
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#98b7af] mb-1.5 block">
            Email
          </label>
          <div className="relative">
            <Mail
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70"
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setAutofilled(false);
              }}
              placeholder="you@globalsolutions.com"
              className="w-full bg-[#04201a]/80 text-white placeholder-[#50756b] text-sm rounded-xl pl-10 pr-4 py-3 border border-[#0df5c4]/25 focus:border-[#0df5c4] focus:ring-1 focus:ring-[#0df5c4] outline-none transition-all"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#98b7af] mb-1.5 block">
            Password
          </label>
          <div className="relative">
            <Lock
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70 pointer-events-none"
            />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setAutofilled(false);
              }}
              placeholder="••••••••"
              className="w-full bg-[#04201a]/80 text-white placeholder-[#50756b] text-sm rounded-xl pl-10 pr-10 py-3 border border-[#0df5c4]/25 focus:border-[#0df5c4] focus:ring-1 focus:ring-[#0df5c4] outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#98b7af] hover:text-[#0df5c4] transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Forgot password */}
        <div className="flex justify-end pt-0.5">
          <Link
            href="/reset-password"
            className="text-xs text-[#0df5c4]/90 hover:text-[#0df5c4] hover:underline font-medium transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Radiant Cyan Sign In Button */}
        <button
          type="submit"
          disabled={loading || isLoading}
          className="w-full mt-2 group relative flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all shadow-[0_0_28px_rgba(13,245,196,0.4)] disabled:opacity-60"
        >
          {loading ? (
            <SpinningDots size="md" className="text-[#01241c]" />
          ) : (
            <>
              <ArrowRight size={17} strokeWidth={2.5} className="group-hover:translate-x-0.5 transition-transform" />
              <span>Sign In</span>
            </>
          )}
        </button>
      </form>

      {/* Footer link */}
      <p className="text-center text-xs text-[#98b7af] mt-5">
        New here?{' '}
        <Link href="/signup" className="text-[#0df5c4] hover:underline font-semibold ml-1">
          Create an account
        </Link>
      </p>
    </div>
  );
}
