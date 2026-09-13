'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import LandingNavbar from './LandingNavbar';
import LiveDateTime from './LiveDateTime';

export default function LandingHero() {
  return (
    <div className="force-dark-page relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden bg-[#010c09] text-white selection:bg-[#0df5c4]/30 selection:text-white">
      {/* Clean cinematic bg — same globe/cityscape as login, no dark left panel */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[url('/images/landing-cinematic-bg.png')] bg-cover bg-center" />
        {/* Soft vignette only — keeps the image visible behind the headline */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#010c09]/25 via-transparent to-[#010c09]/55" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_45%,rgba(1,12,9,0.28)_0%,transparent_55%)]" />
      </div>

      <LandingNavbar variant="landing" />

      <main className="relative z-10 flex-1 flex items-start w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 pt-6 sm:pt-10 lg:pt-14 pb-8">
        <div className="w-full max-w-xl lg:max-w-2xl flex flex-col items-start text-left z-20">
          <div className="flex items-center gap-3 text-[11px] sm:text-xs font-mono font-bold uppercase tracking-[0.28em] mb-8 sm:mb-10 text-[#d4af37] drop-shadow-[0_0_12px_rgba(212,175,55,0.35)]">
            <span className="h-px w-8 bg-[#d4af37]" />
            REMOTE • SMART • GLOBAL
          </div>

          <h1 className="text-6xl sm:text-8xl lg:text-[104px] font-display font-extrabold tracking-tight leading-[1.02] mb-10 sm:mb-14">
            <span className="block text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.85)] [text-shadow:0_0_40px_rgba(1,12,9,0.9)]">
              Global
            </span>
            <span className="mt-3 sm:mt-4 block text-[#0df5c4] drop-shadow-[0_0_28px_rgba(13,245,196,0.45)]">
              Solutions
            </span>
            <span className="mt-7 block h-1 w-20 rounded-full bg-[#0df5c4] shadow-[0_0_16px_rgba(13,245,196,0.55)]" />
          </h1>

          <div className="flex items-center">
            <Link
              href="/login"
              className="group relative inline-flex items-center gap-2.5 px-8 sm:px-9 py-3.5 sm:py-4 rounded-full font-bold text-sm sm:text-base text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-95 transition-all shadow-[0_0_30px_rgba(13,245,196,0.4)]"
            >
              <span>Log in to your workspace</span>
              <ArrowRight
                size={18}
                strokeWidth={2.5}
                className="group-hover:translate-x-1 transition-transform"
              />
            </Link>
          </div>
        </div>
      </main>

      <div className="relative z-20 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-5 grid grid-cols-1 sm:grid-cols-3 items-center gap-3 text-xs text-[#9eb9ae]">
        <div className="flex items-center justify-center sm:justify-start gap-2 tracking-[0.22em] font-mono text-[11px] font-semibold text-[#d4af37]">
          <span className="w-0.5 h-3.5 bg-[#d4af37]" />
          <span>GLOBAL TALENT. REAL IMPACT.</span>
        </div>

        <div className="flex justify-center order-first sm:order-none">
          <LiveDateTime className="text-xs sm:text-sm font-mono font-semibold tracking-wide text-[#b7c9c2]" />
        </div>

        <div className="flex justify-center sm:justify-end">
          <span className="font-mono text-[11px] text-[#d4af37]">© {new Date().getFullYear()} Global Solutions</span>
        </div>
      </div>
    </div>
  );
}
