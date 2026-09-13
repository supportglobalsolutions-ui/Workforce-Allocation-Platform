'use client';

import Link from 'next/link';
import { ArrowRight, LogIn } from 'lucide-react';
import GlobalSolutionsLogo from './GlobalSolutionsLogo';
import LiveDateTime from './LiveDateTime';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { useTheme } from '@/lib/theme/ThemeProvider';

interface LandingNavbarProps {
  variant?: 'landing' | 'login';
}

export default function LandingNavbar({ variant = 'landing' }: LandingNavbarProps) {
  const { isDark } = useTheme();

  return (
    <header
      className={`relative z-40 w-full px-4 sm:px-8 lg:px-12 py-4 sm:py-5 flex items-center justify-between border-b backdrop-blur-xl transition-colors ${
        isDark
          ? 'border-[#0df5c4]/15 bg-[#020e0b]/75'
          : 'border-emerald-900/10 bg-white/80'
      }`}
    >
      <GlobalSolutionsLogo size="md" />

      <div className="flex items-center gap-2.5 sm:gap-4">
        <LiveDateTime
          className={`text-[11px] sm:text-xs font-mono font-semibold tracking-wide ${
            isDark ? 'text-[#8eb6a9]' : 'text-emerald-900/55'
          }`}
        />

        <ThemeToggle variant="icon" />

        {variant === 'landing' && (
          <>
            <Link
              href="/login"
              className={`inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all active:scale-95 ${
                isDark
                  ? 'text-[#0df5c4] bg-[#03201a]/70 hover:bg-[#0df5c4]/15 border border-[#0df5c4]/30 hover:border-[#0df5c4]/60 shadow-[0_0_15px_rgba(13,245,196,0.15)]'
                  : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              <LogIn size={14} />
              <span>Log In</span>
            </Link>

            <Link
              href="/login"
              className="group inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] transition-all shadow-[0_0_20px_rgba(13,245,196,0.35)] active:scale-95"
            >
              <span>Get Started</span>
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </>
        )}

        {variant === 'login' && (
          <Link
            href="/"
            className={`hidden sm:inline-flex text-xs font-semibold transition-colors ${
              isDark ? 'text-[#98b7af] hover:text-[#0df5c4]' : 'text-emerald-800/70 hover:text-emerald-700'
            }`}
          >
            ← Home
          </Link>
        )}
      </div>
    </header>
  );
}
