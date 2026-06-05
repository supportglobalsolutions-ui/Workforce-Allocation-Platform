'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Lock, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import LogoMark from '@/components/theme/LogoMark';
import SpinningDots from '@/components/shared/SpinningDots';
import { useAuth } from '@/lib/auth/AuthProvider';
import { DEMO_ACCOUNTS } from '@/lib/auth/config';
import { ROLE_LANDING } from '@/lib/navigation/config';

export default function LoginPage() {
  const { login, session } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (session) router.replace(ROLE_LANDING[session.primaryPortal]);
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    if (!result.ok) setError(result.error ?? 'Login failed.');
    setLoading(false);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md glass-modal p-8 md:p-10"
      >
        <div className="flex flex-col items-center mb-8">
          <LogoMark size="md" />
          <h1 className="text-xl font-black text-theme-heading mt-4">GlobalSolutions</h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gold-accent mt-1">Sign In</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Email</label>
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Password</label>
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
            <Link href="/reset-password" className="text-xs text-gold-accent hover:underline font-medium">
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
                Login
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-theme">
          <p className="text-[10px] text-theme-muted text-center mb-2 uppercase tracking-wider font-bold">Demo accounts</p>
          <div className="space-y-1 text-[10px] font-mono text-theme-muted text-center">
            {Object.entries(DEMO_ACCOUNTS).map(([em, acc]) => (
              <button
                key={em}
                type="button"
                onClick={() => { setEmail(em); setPassword('123456'); }}
                className="block w-full hover:text-emerald-accent transition-colors py-0.5"
              >
                {em} · {acc.displayName}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
