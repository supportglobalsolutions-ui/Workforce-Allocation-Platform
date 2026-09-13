'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle2, Lock } from 'lucide-react';
import GlobalSolutionsLogo from '@/components/landing/GlobalSolutionsLogo';
import AuthPageShell, { AuthGlassCard } from '@/components/landing/AuthPageShell';
import { useTheme } from '@/lib/theme/ThemeProvider';

export default function ResetPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const { isDark } = useTheme();

  const inputClass = isDark
    ? 'w-full bg-[#04201a]/80 text-white placeholder-[#50756b] text-sm rounded-xl pl-10 pr-4 py-3 border border-[#0df5c4]/25 focus:border-[#0df5c4] focus:ring-1 focus:ring-[#0df5c4] outline-none transition-all'
    : 'w-full bg-emerald-50/80 text-emerald-950 placeholder-emerald-800/35 text-sm rounded-xl pl-10 pr-4 py-3 border border-emerald-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 outline-none transition-all';

  return (
    <AuthPageShell>
      <AuthGlassCard>
        <div className="flex flex-col items-center text-center mb-6">
          <GlobalSolutionsLogo size="md" showText={false} />
          <h1 className="text-xl sm:text-2xl font-display font-bold mt-3 tracking-tight">
            Reset Password
          </h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#0df5c4] mt-1">
            REMOTE • SMART • GLOBAL
          </p>
          <p className={`text-xs text-center mt-3 ${isDark ? 'text-[#98b7af]' : 'text-emerald-800/60'}`}>
            Enter your email and we&apos;ll send a recovery link.
          </p>
        </div>

        {submitted ? (
          <div className="text-center py-4">
            <CheckCircle2 size={40} className="text-[#0df5c4] mx-auto mb-3" />
            <p className={`text-sm ${isDark ? 'text-[#ddf5ee]' : 'text-emerald-900'}`}>
              Recovery link sent. Check your inbox.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
            }}
            className="space-y-4"
          >
            <div>
              <label
                className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 block ${
                  isDark ? 'text-[#98b7af]' : 'text-emerald-800/55'
                }`}
              >
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
                  placeholder="you@globalsolutions.com"
                  className={inputClass}
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-[0.99] transition-all"
            >
              <Lock size={16} strokeWidth={2.5} />
              Send Recovery Link
            </button>
          </form>
        )}

        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-2 text-xs text-[#0df5c4] hover:underline font-semibold"
        >
          <ArrowLeft size={14} />
          Back to Login
        </Link>
      </AuthGlassCard>
    </AuthPageShell>
  );
}
