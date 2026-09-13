'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import LandingNavbar from './LandingNavbar';
import LiveDateTime from './LiveDateTime';
import { useTheme } from '@/lib/theme/ThemeProvider';

export default function LandingHero() {
  const { isDark } = useTheme();

  return (
    <div
      className={`relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden transition-colors ${
        isDark
          ? 'bg-[#010c09] text-white selection:bg-[#0df5c4]/30 selection:text-white'
          : 'bg-[#f4faf7] text-emerald-950 selection:bg-emerald-500/20'
      }`}
    >
      {/* Background — same art, tuned per theme */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className={`absolute inset-0 bg-[url('/images/landing-art-bg.png')] bg-cover bg-center ${
            isDark ? 'opacity-90' : 'opacity-35'
          }`}
          style={{ mixBlendMode: isDark ? 'screen' : 'multiply' }}
        />
        {isDark ? (
          <>
            <div className="absolute -top-32 -left-40 w-[700px] h-[350px] rotate-[-25deg] bg-gradient-to-r from-transparent via-[#0df5c4]/15 to-transparent blur-3xl" />
            <div className="absolute top-1/2 -right-40 w-[800px] h-[400px] rotate-[-30deg] bg-gradient-to-r from-transparent via-[#0df5c4]/12 to-transparent blur-3xl" />
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[1100px] h-[600px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(13,245,196,0.1)_0%,rgba(3,40,32,0.05)_50%,transparent_75%)] blur-3xl" />
            <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-[#010c09] via-transparent to-transparent" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-white/85 via-[#f4faf7]/70 to-[#e8f5ef]/90" />
            <div className="absolute -top-24 left-1/3 w-[500px] h-[280px] rounded-full bg-emerald-300/25 blur-3xl" />
            <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[#f4faf7] to-transparent" />
          </>
        )}
      </div>

      <LandingNavbar variant="landing" />

      <main className="relative z-10 flex-1 flex items-center w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
        <div className="w-full max-w-xl lg:max-w-2xl flex flex-col items-start text-left z-20">
          <div
            className={`text-[11px] sm:text-xs font-mono font-bold uppercase tracking-[0.28em] mb-3 sm:mb-4 ${
              isDark
                ? 'text-[#0df5c4] drop-shadow-[0_0_12px_rgba(13,245,196,0.5)]'
                : 'text-emerald-700'
            }`}
          >
            REMOTE • SMART • GLOBAL
          </div>

          <h1 className="text-5xl sm:text-7xl lg:text-[76px] font-display font-extrabold tracking-tight leading-[1.04] mb-8 sm:mb-10">
            <span
              className={`block ${
                isDark
                  ? 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]'
                  : 'text-emerald-950'
              }`}
            >
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
      </main>

      <div
        className={`relative z-20 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-5 grid grid-cols-1 sm:grid-cols-3 items-center gap-3 text-xs ${
          isDark ? 'text-[#71958b]' : 'text-emerald-800/50'
        }`}
      >
        <div
          className={`flex items-center justify-center sm:justify-start gap-2 tracking-[0.22em] font-mono text-[11px] font-semibold ${
            isDark ? 'text-[#8eb6a9]' : 'text-emerald-800/60'
          }`}
        >
          <span className="w-0.5 h-3.5 bg-[#0df5c4]" />
          <span>GLOBAL TALENT. REAL IMPACT.</span>
        </div>

        <div className="flex justify-center order-first sm:order-none">
          <LiveDateTime
            className={`text-xs sm:text-sm font-mono font-semibold tracking-wide ${
              isDark ? 'text-[#8eb6a9]' : 'text-emerald-900/55'
            }`}
          />
        </div>

        <div className="flex justify-center sm:justify-end">
          <span className="font-mono text-[11px]">© {new Date().getFullYear()} Global Solutions</span>
        </div>
      </div>
    </div>
  );
}
