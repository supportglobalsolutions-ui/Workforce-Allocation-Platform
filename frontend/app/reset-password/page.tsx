'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle2, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import GlobalSolutionsLogo from '@/components/landing/GlobalSolutionsLogo';
import AuthPageShell, { AuthGlassCard } from '@/components/landing/AuthPageShell';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import ErrorToast from '@/components/shared/ErrorToast';

type RecoveryStage = 'request' | 'sent' | 'update' | 'complete';

export default function ResetPasswordPage() {
  const [stage, setStage] = useState<RecoveryStage>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hashHasRecoveryType = window.location.hash.includes('type=recovery');
    if (hashHasRecoveryType) setStage('update');

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStage('update');
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Accepts a username or an email; the server resolves it and sends
      // nothing at all when no account matches.
      await api.post('/auth/password-recovery', { identifier: email.trim() });
      setStage('sent');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(
        /too many requests/i.test(message)
          ? 'You have made three recovery requests. Please try again in 6 hours.'
          : 'We could not send a recovery link right now. Please try again later.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password.length < 12) {
      setError('Use a password with at least 12 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/password-reset', { password });
      await supabase.auth.signOut();
      setStage('complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(
        /too many requests/i.test(message)
          ? 'This password was already changed recently. Please try again in 24 hours.'
          : /expired|invalid|401/i.test(message)
            ? 'This recovery link has expired. Request a new link and try again.'
            : 'We could not update your password. Refresh the page or request a new recovery link.',
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full bg-[#04201a]/80 text-white placeholder-[#50756b] text-sm rounded-xl pl-10 pr-4 py-3 border border-[#0df5c4]/25 focus:border-[#0df5c4] focus:ring-1 focus:ring-[#0df5c4] outline-none transition-all';
  const labelClass = 'text-[10px] font-bold uppercase tracking-wider text-[#98b7af] mb-1.5 block';

  return (
    <AuthPageShell>
      <AuthGlassCard>
        <div className="flex flex-col items-center text-center mb-6">
          <GlobalSolutionsLogo size="md" showOperations={false} />
          <h1 className="text-xl sm:text-2xl font-display font-bold mt-5 tracking-tight text-white">
            {stage === 'update' ? 'Choose a new password' : 'Reset your password'}
          </h1>
          <p className="text-xs text-[#98b7af] text-center mt-3">
            {stage === 'update'
              ? 'Create a new password for your GlobalSolutions account.'
              : 'Enter your email and we’ll send you a secure recovery link.'}
          </p>
        </div>

        {stage === 'sent' && (
          <div className="text-center py-4">
            <CheckCircle2 size={40} className="text-[#0df5c4] mx-auto mb-3" />
            <p className="text-sm text-[#ddf5ee]">If this email has an account, a recovery link is on its way.</p>
          </div>
        )}

        {stage === 'complete' && (
          <div className="text-center py-4">
            <CheckCircle2 size={40} className="text-[#0df5c4] mx-auto mb-3" />
            <p className="text-sm text-[#ddf5ee]">Your password has been updated.</p>
            <Link href="/login" className="mt-5 inline-flex text-sm font-semibold text-[#0df5c4] hover:underline">Continue to login</Link>
          </div>
        )}

        {stage === 'request' && (
          <form onSubmit={requestRecovery} className="space-y-4">
            <div>
              <label className={labelClass}>Username or email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70" />
                {/* type="text" so a username is accepted — type="email" would
                    fail browser validation before the request is even sent. */}
                <input type="text" required maxLength={254} autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="yourname or you@globalsolutions.com" className={inputClass} />
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all disabled:opacity-60">
              <Mail size={16} strokeWidth={2.5} />
              {loading ? 'Sending…' : 'Send recovery link'}
            </button>
          </form>
        )}

        {stage === 'update' && (
          <form onSubmit={updatePassword} className="space-y-4">
            <div>
              <label className={labelClass}>New password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70" />
                <input type={showPassword ? 'text' : 'password'} required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" className={`${inputClass} pr-11`} />
                <button type="button" onClick={() => setShowPassword((shown) => !shown)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#98b7af] hover:text-[#0df5c4] transition-colors" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass}>Confirm new password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0df5c4]/70" />
                <input type={showConfirmPassword ? 'text' : 'password'} required minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your new password" className={`${inputClass} pr-11`} />
                <button type="button" onClick={() => setShowConfirmPassword((shown) => !shown)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#98b7af] hover:text-[#0df5c4] transition-colors" aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all disabled:opacity-60">
              <Lock size={16} strokeWidth={2.5} />
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        <ErrorToast message={error} onDismiss={() => setError('')} />

        {(stage === 'request' || stage === 'sent') && (
          <Link href="/login" className="mt-6 flex items-center justify-center gap-2 text-xs text-[#0df5c4] hover:underline font-semibold">
            <ArrowLeft size={14} />
            Back to login
          </Link>
        )}
      </AuthGlassCard>
    </AuthPageShell>
  );
}
