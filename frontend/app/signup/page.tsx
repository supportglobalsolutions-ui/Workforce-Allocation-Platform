'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, Mail, Lock, AlertCircle, CheckCircle, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
import GlobalSolutionsLogo from '@/components/landing/GlobalSolutionsLogo';
import AuthPageShell, { AuthGlassCard } from '@/components/landing/AuthPageShell';
import SpinningDots from '@/components/shared/SpinningDots';
import { useAuth } from '@/lib/auth/AuthProvider';
import { apiRegisterUser, requestSignupOtp, verifySignupOtp } from '@/lib/auth/supabase-auth';
import { getAuthErrorMessage } from '@/lib/auth/errors';
import { ROLE_LANDING } from '@/lib/navigation/config';

type Step = 'email' | 'code' | 'password' | 'done';

export default function SignupPage() {
  const { session, isLoading } = useAuth();
  // Signup always uses the dark auth shell, independent of dashboard theme.
  const isDark = true;
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [resendsLeft, setResendsLeft] = useState(5);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!session) return;
    router.replace(ROLE_LANDING[session.primaryPortal]);
  }, [session, router]);

  const inputClass = isDark
    ? 'w-full bg-[#04201a]/80 text-white placeholder-[#50756b] text-sm rounded-xl pl-10 pr-4 py-3 border border-[#0df5c4]/25 focus:border-[#0df5c4] focus:ring-1 focus:ring-[#0df5c4] outline-none transition-all'
    : 'w-full bg-emerald-50/80 text-emerald-950 placeholder-emerald-800/35 text-sm rounded-xl pl-10 pr-4 py-3 border border-emerald-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 outline-none transition-all';

  const labelClass = isDark
    ? 'text-[10px] font-bold uppercase tracking-wider text-[#d4af37] mb-1.5 block'
    : 'text-[10px] font-bold uppercase tracking-wider text-emerald-800/55 mb-1.5 block';

  const sendCode = async (resend: boolean) => {
    setError('');
    setSendingCode(true);
    setStep('code');
    try {
      const result = await requestSignupOtp(email, resend);
      setSentTo(result.sent_to);
      setResendsLeft(result.resends_remaining ?? 5);
      setCode('');
    } catch (err: unknown) {
      if (!resend) setStep('email');
      setError(getAuthErrorMessage(err));
    } finally {
      setSendingCode(false);
      setLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || sendingCode) return;
    setLoading(true);
    await sendCode(false);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || sendingCode) return;
    setError('');
    setLoading(true);
    try {
      const result = await verifySignupOtp(email, code);
      setVerificationToken(result.verification_token);
      setStep('password');
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const displayName = email.split('@')[0] || 'User';
      await apiRegisterUser(email, password, displayName, verificationToken);
      setStep('done');
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <AuthPageShell>
        <SpinningDots size="lg" className="text-[#0df5c4]" />
      </AuthPageShell>
    );
  }

  if (step === 'done') {
    return (
      <AuthPageShell>
        <AuthGlassCard className="text-center">
          <CheckCircle size={40} className="mx-auto text-[#0df5c4] mb-4" />
          <h1 className="text-xl sm:text-2xl font-display font-bold mb-2">Account created</h1>
          <p className={`text-sm mb-6 ${isDark ? 'text-[#98b7af]' : 'text-emerald-800/60'}`}>
            Your account is pending admin approval. You cannot sign in until an administrator
            approves your account.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] transition-all"
          >
            Back to sign in
            <ArrowRight size={16} />
          </Link>
        </AuthGlassCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthGlassCard>
        <div className="flex flex-col items-center text-center mb-6">
          <GlobalSolutionsLogo size="md" showText={false} />
          <h1 className="text-xl sm:text-2xl font-display font-bold mt-3 tracking-tight">
            Create account
          </h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#0df5c4] mt-1">
            REMOTE • SMART • GLOBAL
          </p>
        </div>

        {step === 'email' && (
          <form onSubmit={handleEmail} className="space-y-4">
            <div>
              <label className={labelClass}>Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@globalsolutions.com"
                  className={inputClass}
                />
              </div>
              <p className={`mt-2 text-[11px] ${isDark ? 'text-[#98b7af]' : 'text-emerald-800/55'}`}>
                We’ll send a verification code before the account is created.
              </p>
            </div>
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {loading ? <SpinningDots size="md" className="text-[#01241c]" /> : 'Send verification code'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-[#0df5c4]">
              <ShieldCheck size={16} />
              <span className="text-sm font-bold">
                {sendingCode ? 'Sending verification code…' : 'Check your email'}
              </span>
            </div>
            <p className={`text-xs text-center ${isDark ? 'text-[#c7d9d3]' : 'text-emerald-800/60'}`}>
              {sendingCode ? 'Sending a 6-digit code to ' : 'Enter the 6-digit code sent to '}
              <span className="font-semibold text-white">{sentTo || email}</span>.
            </p>
            <div>
              <label className={labelClass}>Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={code}
                disabled={sendingCode}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                placeholder={sendingCode ? 'Sending…' : '••••••'}
                className={`${inputClass} pl-4 tracking-[0.35em] text-center font-mono text-lg disabled:opacity-60`}
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading || sendingCode || code.length < 6}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {loading || sendingCode ? (
                <SpinningDots size="md" className="text-[#01241c]" />
              ) : (
                'Verify email'
              )}
            </button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => { setStep('email'); setError(''); setCode(''); }}
                className="text-[#c7d9d3] hover:text-[#0df5c4]"
              >
                ← Change email
              </button>
              <button
                type="button"
                disabled={loading || sendingCode || resendsLeft <= 0}
                onClick={() => { void sendCode(true); }}
                className="text-[#0df5c4] hover:underline font-semibold disabled:opacity-50"
              >
                {resendsLeft <= 0 ? 'No resends left' : `Resend code (${resendsLeft})`}
              </button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handleCreate} className="space-y-4">
            <p className={`text-xs text-center ${isDark ? 'text-[#98b7af]' : 'text-emerald-800/60'}`}>
              Email confirmed. Choose a password to create the account.
            </p>
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
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
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {loading ? (
                <SpinningDots size="md" className="text-[#01241c]" />
              ) : (
                <>
                  <UserPlus size={17} strokeWidth={2.5} />
                  <span>Create account</span>
                </>
              )}
            </button>
          </form>
        )}

        <p className={`text-center text-xs mt-5 ${isDark ? 'text-[#98b7af]' : 'text-emerald-800/55'}`}>
          Already have an account?{' '}
          <Link href="/login" className="text-[#0df5c4] hover:underline font-semibold ml-1">
            Sign in
          </Link>
        </p>
      </AuthGlassCard>
    </AuthPageShell>
  );
}
