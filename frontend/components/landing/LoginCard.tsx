'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, AlertCircle } from 'lucide-react';
import GlobalSolutionsLogo from './GlobalSolutionsLogo';
import { AuthGlassCard } from './AuthPageShell';
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
  process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || 'peterkelvinkibiru1532@gmail.com';
const DEFAULT_SUPER_ADMIN_PASSWORD = '';

export default function LoginCard({ onSuccess, className = '' }: LoginCardProps) {
  const { login, session, isLoading } = useAuth();
  const isDark = true;
  const router = useRouter();

  const [email, setEmail] = useState(DEFAULT_SUPER_ADMIN_EMAIL);
  const [password, setPassword] = useState(DEFAULT_SUPER_ADMIN_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [autofilled, setAutofilled] = useState(true);

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
      } else if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = isDark
    ? 'w-full bg-[#04201a]/80 text-white placeholder-[#50756b] text-sm rounded-xl pl-10 pr-4 py-3 border border-[#0df5c4]/25 focus:border-[#0df5c4] focus:ring-1 focus:ring-[#0df5c4] outline-none transition-all'
    : 'w-full bg-emerald-50/80 text-emerald-950 placeholder-emerald-800/35 text-sm rounded-xl pl-10 pr-4 py-3 border border-emerald-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 outline-none transition-all';

  const labelClass = isDark
    ? 'text-[10px] font-bold uppercase tracking-wider text-[#98b7af] mb-1.5 block'
    : 'text-[10px] font-bold uppercase tracking-wider text-emerald-800/55 mb-1.5 block';

  return (
    <AuthGlassCard className={className}>
      <div className="flex flex-col items-center text-center mb-6">
        <GlobalSolutionsLogo size="lg" />

        {autofilled && (
          <div className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-[#0df5c4]/10 border border-[#0df5c4]/30 text-[#0df5c4]">
            <Check size={12} className="text-[#0df5c4]" />
            <span>Super Admin prefilled</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Email</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setAutofilled(false);
              }}
              placeholder="you@globalsolutions.com"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Password</label>
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
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className={`absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors ${
                isDark ? 'text-[#98b7af] hover:text-[#0df5c4]' : 'text-emerald-700/50 hover:text-emerald-700'
              }`}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-0.5">
          <Link
            href="/reset-password"
            className="text-xs text-[#0df5c4] hover:underline font-medium transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || isLoading}
          className="w-full mt-2 group relative flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all shadow-[0_0_28px_rgba(13,245,196,0.35)] disabled:opacity-60"
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

      <p className={`text-center text-xs mt-5 ${isDark ? 'text-[#98b7af]' : 'text-emerald-800/55'}`}>
        New here?{' '}
        <Link href="/signup" className="text-[#0df5c4] hover:underline font-semibold ml-1">
          Create an account
        </Link>
      </p>
    </AuthGlassCard>
  );
}
