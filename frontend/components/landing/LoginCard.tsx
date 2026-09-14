'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';
import GlobalSolutionsLogo from './GlobalSolutionsLogo';
import { AuthGlassCard } from './AuthPageShell';
import SpinningDots from '@/components/shared/SpinningDots';
import { useAuth } from '@/lib/auth/AuthProvider';
import { setAuthRoleCookie } from '@/lib/auth/cookies';
import { ROLE_LANDING } from '@/lib/navigation/config';
import type { LoginOtpChallenge } from '@/lib/auth/supabase-auth';
import ErrorToast from '@/components/shared/ErrorToast';

interface LoginCardProps {
  onSuccess?: () => void;
  className?: string;
  isModal?: boolean;
}

const DEFAULT_SUPER_ADMIN_EMAIL = '';
const DEFAULT_SUPER_ADMIN_PASSWORD = '';

export default function LoginCard({ onSuccess, className = '' }: LoginCardProps) {
  const { login, verifyOtp, resendOtp, cancelOtp, session, isLoading, pendingLoginOtp } = useAuth();
  const isDark = true;
  const router = useRouter();

  const [email, setEmail] = useState(DEFAULT_SUPER_ADMIN_EMAIL);
  const [password, setPassword] = useState(DEFAULT_SUPER_ADMIN_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpChallenge, setOtpChallenge] = useState<LoginOtpChallenge | null>(null);
  const [otpCode, setOtpCode] = useState('');

  useEffect(() => {
    if (!session || pendingLoginOtp || otpChallenge) return;
    setAuthRoleCookie(session.authRole);
    if (onSuccess) {
      onSuccess();
    } else {
      router.replace(ROLE_LANDING[session.primaryPortal]);
    }
  }, [session, router, onSuccess, otpChallenge, pendingLoginOtp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      if (!result.ok) {
        setError(result.error ?? 'Login failed. Please check credentials.');
      } else if (result.otpRequired) {
        setOtpChallenge(result.challenge);
        setOtpCode('');
      } else if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const challengeId = pendingLoginOtp?.challenge?.challenge_id ?? otpChallenge?.challenge_id;
    if (!challengeId) return;
    setError('');
    setLoading(true);
    try {
      const result = await verifyOtp(challengeId, otpCode);
      if (!result.ok) {
        setError(result.error ?? 'Invalid code.');
      } else {
        setOtpChallenge(null);
        if (onSuccess) onSuccess();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const result = await resendOtp();
      if (!result.ok) {
        setError(result.error ?? 'Could not resend code.');
      } else if (result.otpRequired) {
        setOtpChallenge(result.challenge);
        setOtpCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBack = async () => {
    setLoading(true);
    await cancelOtp();
    setOtpChallenge(null);
    setOtpCode('');
    setError('');
    setLoading(false);
  };

  const inputClass = isDark
    ? 'w-full bg-[#04201a]/80 text-white placeholder-[#50756b] text-sm rounded-xl pl-10 pr-4 py-3 border border-[#0df5c4]/25 focus:border-[#0df5c4] focus:ring-1 focus:ring-[#0df5c4] outline-none transition-all'
    : 'w-full bg-emerald-50/80 text-emerald-950 placeholder-emerald-800/35 text-sm rounded-xl pl-10 pr-4 py-3 border border-emerald-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 outline-none transition-all';

  const labelClass = isDark
    ? 'text-[10px] font-bold uppercase tracking-wider text-[#d4af37] mb-1.5 block'
    : 'text-[10px] font-bold uppercase tracking-wider text-emerald-800/55 mb-1.5 block';

  const activeChallenge = pendingLoginOtp?.challenge ?? otpChallenge;
  const showOtp = Boolean(pendingLoginOtp) || Boolean(otpChallenge?.required);
  const sendingCode = Boolean(pendingLoginOtp?.sending) || (!activeChallenge?.challenge_id && showOtp);
  const sentTo = pendingLoginOtp?.sentTo ?? activeChallenge?.sent_to ?? 'your email';
  const resendsLeft = pendingLoginOtp?.resendsRemaining ?? activeChallenge?.resends_remaining ?? 5;

  if (showOtp) {
    return (
      <AuthGlassCard className={className}>
        <div className="flex flex-col items-center text-center mb-6">
          <GlobalSolutionsLogo size="lg" showOperations={false} />
          <div className="mt-4 flex items-center gap-2 text-[#0df5c4]">
            <ShieldCheck size={18} />
            <span className="text-sm font-bold">
              {sendingCode ? 'Sending verification code…' : 'Check your email'}
            </span>
          </div>
          <p className="mt-2 text-xs text-[#98b7af] max-w-xs">
            Admin sign-in needs email verification.{' '}
            {sendingCode ? 'Sending a 6-digit code to ' : 'We sent a 6-digit code to '}
            <span className="text-white font-semibold">{sentTo}</span>.
          </p>
        </div>

        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label className={labelClass}>Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={8}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              placeholder={sendingCode ? 'Sending…' : '••••••'}
              disabled={sendingCode || !activeChallenge?.challenge_id}
              className={`${inputClass} pl-4 tracking-[0.35em] text-center font-mono text-lg disabled:opacity-60`}
            />
          </div>

          <ErrorToast message={error} onDismiss={() => setError('')} />

          <button
            type="submit"
            disabled={loading || sendingCode || !activeChallenge?.challenge_id || otpCode.length < 6}
            className="w-full mt-2 group relative flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all shadow-[0_0_28px_rgba(13,245,196,0.35)] disabled:opacity-60"
          >
            {loading || sendingCode ? (
              <SpinningDots size="md" className="text-[#01241c]" />
            ) : (
              <>
                <ArrowRight size={17} strokeWidth={2.5} />
                <span>Verify & continue</span>
              </>
            )}
          </button>
        </form>

        <div className="flex items-center justify-between mt-5 text-xs">
          <button
            type="button"
            onClick={handleBack}
            className="text-[#98b7af] hover:text-[#0df5c4] transition-colors"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={loading || sendingCode || resendsLeft <= 0}
            className="text-[#0df5c4] hover:underline font-semibold disabled:opacity-50"
          >
            {resendsLeft <= 0 ? 'No resends left' : `Resend code (${resendsLeft})`}
          </button>
        </div>
      </AuthGlassCard>
    );
  }

  return (
    <AuthGlassCard className={className}>
      <div className="flex flex-col items-center text-center mb-6">
        <GlobalSolutionsLogo size="lg" showOperations={false} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Username or email</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70" />
            {/* Either identifier works, so this cannot be type="email" — the
                browser would reject a username before submit. */}
            <input
              type="text"
              required
              maxLength={254}
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              placeholder="yourname or you@globalsolutions.com"
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
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
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

        <ErrorToast message={error} onDismiss={() => setError('')} />

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
