'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import LogoMark from '@/components/theme/LogoMark';
import SpinningDots from '@/components/shared/SpinningDots';
import { useAuth } from '@/lib/auth/AuthProvider';
import { setAuthRoleCookie } from '@/lib/auth/cookies';
import { ROLE_LANDING } from '@/lib/navigation/config';

export default function LoginPage() {
  const { login, session, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!session) return;
    setAuthRoleCookie(session.authRole);
    router.replace(ROLE_LANDING[session.primaryPortal]);
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    const result = await login(email, password);
    if (!result.ok) setError(result.error ?? 'Login failed.');
    setLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <SpinningDots size="lg" className="text-emerald-accent" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="relative z-10 w-full max-w-md glass-modal p-8 md:p-10">
        <div className="flex flex-col items-center mb-8">
          <LogoMark size="md" />
          <h1 className="type-headline-md text-theme-heading mt-6 font-display">
            Global Solutions
          </h1>
          <p className="type-label-caps mt-3 text-theme-muted">
            <span className="text-emerald-accent">Remote</span>
            <span className="text-gold-accent/60 mx-1.5">·</span>
            <span className="text-gold-accent">Smart</span>
            <span className="text-gold-accent/60 mx-1.5">·</span>
            <span className="text-emerald-accent">Global</span>
          </p>
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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

          <div className="flex justify-end">
            <Link href="/reset-password" prefetch className="text-xs text-gold-accent hover:underline font-medium">
              Forgot password?
            </Link>
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
                <Lock size={16} />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="text-center text-sm text-theme-muted mt-6">
          New here?{' '}
          <Link href="/signup" className="text-emerald-accent hover:underline font-medium">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
