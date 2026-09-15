'use client';

import Link from 'next/link';
import { LogIn } from 'lucide-react';
import GlobalSolutionsLogo from './GlobalSolutionsLogo';

interface LandingNavbarProps {
  variant?: 'landing' | 'login' | 'contact';
}

export default function LandingNavbar({ variant = 'landing' }: LandingNavbarProps) {
  return (
    <header
      className="relative z-40 w-full px-4 sm:px-6 lg:px-12 py-4 sm:py-5 flex items-center justify-between border-b border-[#d4af37]/20 bg-transparent backdrop-blur-md"
    >
      <GlobalSolutionsLogo size="md" showOperations={false} />

      <div className="flex items-center gap-3">
        {variant === 'landing' && (
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold text-[#d4af37] bg-[#03201a]/70 hover:bg-[#d4af37]/10 border border-[#d4af37]/40 hover:border-[#d4af37]/75 shadow-[0_0_15px_rgba(212,175,55,0.14)] transition-all active:scale-95"
          >
            <LogIn size={14} />
            <span>Log In</span>
          </Link>
        )}

        {variant === 'login' && (
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 text-sm font-bold tracking-wide text-[#d4af37] hover:text-[#f0cf66] transition-colors"
          >
            ← Home
          </Link>
        )}

        {variant === 'contact' && (
          <>
            <Link
              href="/"
              className="inline-flex items-center px-3 sm:px-4 py-2 text-sm font-bold tracking-wide text-[#d4af37] hover:text-[#f0cf66] transition-colors"
            >
              ← Home
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold text-[#d4af37] bg-[#03201a]/70 hover:bg-[#d4af37]/10 border border-[#d4af37]/40 hover:border-[#d4af37]/75 shadow-[0_0_15px_rgba(212,175,55,0.14)] transition-all active:scale-95"
            >
              <LogIn size={14} />
              <span>Log in</span>
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
