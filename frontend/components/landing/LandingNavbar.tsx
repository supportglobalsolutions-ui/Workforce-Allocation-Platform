'use client';

import Link from 'next/link';
import { LogIn } from 'lucide-react';
import GlobalSolutionsLogo from './GlobalSolutionsLogo';

interface LandingNavbarProps {
  variant?: 'landing' | 'login';
}

export default function LandingNavbar({ variant = 'landing' }: LandingNavbarProps) {
  return (
    <header
      className="relative z-40 w-full px-4 sm:px-6 lg:px-12 py-4 sm:py-5 flex items-center justify-between border-b border-[#0df5c4]/15 bg-[#020e0b]/75 backdrop-blur-xl"
    >
      <GlobalSolutionsLogo size="md" />

      <div className="flex items-center gap-3">
        {variant === 'landing' && (
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold text-[#0df5c4] bg-[#03201a]/70 hover:bg-[#0df5c4]/15 border border-[#0df5c4]/30 hover:border-[#0df5c4]/60 shadow-[0_0_15px_rgba(13,245,196,0.15)] transition-all active:scale-95"
          >
            <LogIn size={14} />
            <span>Log In</span>
          </Link>
        )}

        {variant === 'login' && (
          <Link
            href="/"
            className="inline-flex text-xs font-semibold text-[#98b7af] hover:text-[#0df5c4] transition-colors"
          >
            ← Home
          </Link>
        )}
      </div>
    </header>
  );
}
