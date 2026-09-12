'use client';

import Link from 'next/link';
import { Globe, ArrowRight, LogIn } from 'lucide-react';
import GlobalSolutionsLogo from './GlobalSolutionsLogo';

interface LandingNavbarProps {
  onOpenVideo?: () => void;
  variant?: 'landing' | 'login';
}

export default function LandingNavbar({
  onOpenVideo,
  variant = 'landing',
}: LandingNavbarProps) {
  return (
    <header className="relative z-40 w-full px-4 sm:px-8 lg:px-12 py-4 sm:py-5 flex items-center justify-between border-b border-[#0df5c4]/15 bg-[#020e0b]/75 backdrop-blur-xl">
      {/* Brand logo */}
      <GlobalSolutionsLogo size="md" />

      {/* Center Nav Links */}
      <nav className="hidden md:flex items-center gap-7 lg:gap-9 text-sm font-medium">
        <Link
          href="/"
          className="relative text-white font-semibold transition-colors hover:text-[#0df5c4]"
        >
          Home
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-[#0df5c4] shadow-[0_0_10px_#0df5c4]" />
        </Link>
        <a
          href="#features"
          className="text-[#98b7af] transition-colors hover:text-[#0df5c4]"
        >
          Features
        </a>
        <a
          href="#about"
          className="text-[#98b7af] transition-colors hover:text-[#0df5c4]"
        >
          About
        </a>
        {variant === 'landing' && (
          <a
            href="#pricing"
            className="text-[#98b7af] transition-colors hover:text-[#0df5c4]"
          >
            Pricing
          </a>
        )}
        <a
          href="#contact"
          className="text-[#98b7af] transition-colors hover:text-[#0df5c4]"
        >
          Contact
        </a>
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-3 sm:gap-4">
        {variant === 'login' ? (
          <div className="hidden sm:inline-flex items-center gap-2 text-xs font-mono font-bold tracking-widest uppercase text-[#0df5c4] bg-[#0df5c4]/10 border border-[#0df5c4]/25 px-3 py-1.5 rounded-full">
            <span>Remote</span>
            <span className="text-white/40">|</span>
            <span>Smart</span>
            <span className="text-white/40">|</span>
            <span>Global</span>
          </div>
        ) : (
          <>
            {/* Status indicator: • Remote Work */}
            <div className="hidden lg:flex items-center gap-2 text-xs font-medium text-[#98b7af] bg-[#031d17]/80 border border-[#0df5c4]/20 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0df5c4] shadow-[0_0_8px_#0df5c4] animate-pulse" />
              <span>Remote Work</span>
              <Globe size={13} className="text-[#0df5c4] ml-0.5" />
            </div>

            {/* Prominent Log In Button taking user straight to /login */}
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold text-[#0df5c4] bg-[#03201a]/70 hover:bg-[#0df5c4]/15 border border-[#0df5c4]/30 hover:border-[#0df5c4]/60 transition-all shadow-[0_0_15px_rgba(13,245,196,0.15)] active:scale-95"
            >
              <LogIn size={14} className="text-[#0df5c4]" />
              <span>Log In</span>
            </Link>

            {/* Get Started Button */}
            <Link
              href="/login"
              className="group inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] transition-all shadow-[0_0_20px_rgba(13,245,196,0.4)] hover:shadow-[0_0_28px_rgba(13,245,196,0.6)] active:scale-95"
            >
              <span>Get Started</span>
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
