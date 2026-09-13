'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import LandingNavbar from './LandingNavbar';
import LiveDateTime from './LiveDateTime';
import GlobeShowcase from './GlobeShowcase';

export default function LandingHero() {
  return (
    <div className="force-dark-page relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden bg-[#06241c] text-white selection:bg-[#0df5c4]/30 selection:text-white">
      {/* Soft lit backdrop — no fullscreen globe image */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a3d32] via-[#083028] to-[#0b2f26]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgba(13,245,196,0.18)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_45%,rgba(13,245,196,0.22)_0%,transparent_50%)]" />
        <div className="absolute top-1/3 left-1/4 w-[520px] h-[320px] rounded-full bg-[#0df5c4]/10 blur-3xl" />
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[#041a15]/80 to-transparent" />
      </div>

      <LandingNavbar variant="landing" />

      <main className="relative z-10 flex-1 flex items-center w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-6 sm:py-10">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          <div className="lg:col-span-5 w-full flex flex-col items-start text-left z-20">
            <div className="text-[11px] sm:text-xs font-mono font-bold uppercase tracking-[0.28em] mb-3 sm:mb-4 text-[#0df5c4] drop-shadow-[0_0_12px_rgba(13,245,196,0.5)]">
              REMOTE • SMART • GLOBAL
            </div>

            <h1 className="text-5xl sm:text-7xl lg:text-[76px] font-display font-extrabold tracking-tight leading-[1.04] mb-8 sm:mb-10">
              <span className="block text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
                Global
              </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0df5c4] via-[#4df8cf] to-[#14e9b6] drop-shadow-[0_0_35px_rgba(13,245,196,0.35)]">
                Solutions
              </span>
            </h1>

            <div className="flex items-center">
              <Link
                href="/login"
                className="group relative inline-flex items-center gap-2.5 px-8 sm:px-9 py-3.5 sm:py-4 rounded-full font-bold text-sm sm:text-base text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-95 transition-all shadow-[0_0_30px_rgba(13,245,196,0.35)]"
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

          <div className="lg:col-span-7 w-full flex justify-center lg:justify-end">
            <GlobeShowcase />
          </div>
        </div>
      </main>

      <div className="relative z-20 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-5 grid grid-cols-1 sm:grid-cols-3 items-center gap-3 text-xs text-[#8eb6a9]">
        <div className="flex items-center justify-center sm:justify-start gap-2 tracking-[0.22em] font-mono text-[11px] font-semibold">
          <span className="w-0.5 h-3.5 bg-[#0df5c4]" />
          <span>GLOBAL TALENT. REAL IMPACT.</span>
        </div>

        <div className="flex justify-center order-first sm:order-none">
          <LiveDateTime className="text-xs sm:text-sm font-mono font-semibold tracking-wide text-[#8eb6a9]" />
        </div>

        <div className="flex justify-center sm:justify-end">
          <span className="font-mono text-[11px]">© {new Date().getFullYear()} Global Solutions</span>
        </div>
      </div>
    </div>
  );
}
