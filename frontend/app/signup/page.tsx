'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, Mail, Lock, AlertCircle, CheckCircle, Eye, EyeOff, ArrowRight } from 'lucide-react';
import GlobalSolutionsLogo from '@/components/landing/GlobalSolutionsLogo';
import AuthPageShell, { AuthGlassCard } from '@/components/landing/AuthPageShell';
import SpinningDots from '@/components/shared/SpinningDots';
import { useAuth } from '@/lib/auth/AuthProvider';
import { apiRegisterUser } from '@/lib/auth/supabase-auth';
import { getAuthErrorMessage } from '@/lib/auth/errors';
import { ROLE_LANDING } from '@/lib/navigation/config';
import { useTheme } from '@/lib/theme/ThemeProvider';

export default function SignupPage() {
  const { session, isLoading } = useAuth();
  const { isDark } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!session) return;
    router.replace(ROLE_LANDING[session.primaryPortal]);
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const displayName = email.split('@')[0] || 'User';
      await apiRegisterUser(email, password, displayName);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err));
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

  if (isLoading) {
    return (
      <AuthPageShell>
        <SpinningDots size="lg" className="text-[#0df5c4]" />
      </AuthPageShell>
    );
  }

  if (submitted) {
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

        <form onSubmit={handleSubmit} className="space-y-4">
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
