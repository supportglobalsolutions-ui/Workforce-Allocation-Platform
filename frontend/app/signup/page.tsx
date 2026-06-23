'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, Mail, Lock, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import LogoMark from '@/components/theme/LogoMark';
import SpinningDots from '@/components/shared/SpinningDots';
import { useAuth } from '@/lib/auth/AuthProvider';
import { apiRegisterUser } from '@/lib/auth/firebase-auth';

export default function SignupPage() {
  const { session } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (session) router.replace('/login');
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const displayName = email.split('@')[0] || 'User';
      await apiRegisterUser(email, password, displayName);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="relative z-10 w-full max-w-md glass-modal p-8 md:p-10 text-center">
          <CheckCircle size={40} className="mx-auto text-emerald-accent mb-4" />
          <h1 className="type-headline-md text-theme-heading font-display mb-2">Account created</h1>
          <p className="text-sm text-theme-muted mb-6">
            Your account is pending admin approval. You cannot sign in until an administrator approves your account.
          </p>
          <Link href="/login" className="btn-primary inline-flex items-center gap-2">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="relative z-10 w-full max-w-md glass-modal p-8 md:p-10">
        <div className="flex flex-col items-center mb-8">
          <LogoMark size="md" />
          <h1 className="type-headline-md text-theme-heading mt-6 font-display">Create account</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">
              Email
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-accent/70" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@globalsolutions.com"
                className="input-field pl-10"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-accent/70 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="input-field pl-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-emerald-accent transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full flex items-center justify-center gap-2 py-3 disabled:opacity-60 ${
              loading ? 'btn-secondary' : 'btn-primary'
            }`}
          >
            {loading ? (
              <SpinningDots size="md" className="text-emerald-accent" />
            ) : (
              <>
                <UserPlus size={16} />
                Create account
              </>
            )}
          </button>
        </form>

        <p className="text-center text-sm text-theme-muted mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-emerald-accent hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
