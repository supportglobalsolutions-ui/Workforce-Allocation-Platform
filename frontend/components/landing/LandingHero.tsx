'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Play, X } from 'lucide-react';
import LandingNavbar from './LandingNavbar';
import { useTheme } from '@/lib/theme/ThemeProvider';

export default function LandingHero() {
  const [showVideoModal, setShowVideoModal] = useState(false);
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

          <div className="flex flex-wrap items-center gap-4 sm:gap-5">
            <Link
              href="/login"
              className="group relative inline-flex items-center gap-2.5 px-8 sm:px-9 py-3.5 sm:py-4 rounded-full font-bold text-sm sm:text-base text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-95 transition-all shadow-[0_0_30px_rgba(13,245,196,0.35)]"
            >
              <span>Get Started</span>
              <ArrowRight
                size={18}
                strokeWidth={2.5}
                className="group-hover:translate-x-1 transition-transform"
              />
            </Link>

            <Link
              href="/login"
              className={`group inline-flex items-center gap-2.5 px-7 sm:px-8 py-3.5 sm:py-4 rounded-full font-semibold text-sm sm:text-base transition-all active:scale-95 ${
                isDark
                  ? 'text-white bg-[#03201a]/70 hover:bg-[#032820] border border-[#0df5c4]/30 hover:border-[#0df5c4]/60'
                  : 'text-emerald-900 bg-white hover:bg-emerald-50 border border-emerald-200 shadow-sm'
              }`}
            >
              <span>Log In</span>
            </Link>

            <button
              type="button"
              onClick={() => setShowVideoModal(true)}
              className={`group inline-flex items-center gap-2.5 px-7 sm:px-8 py-3.5 sm:py-4 rounded-full font-semibold text-sm sm:text-base transition-all active:scale-95 ${
                isDark
                  ? 'text-white bg-[#03201a]/70 border border-[#0df5c4]/30'
                  : 'text-emerald-900 bg-white/80 border border-emerald-200'
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-[#0df5c4]/20 flex items-center justify-center text-[#0df5c4]">
                <Play size={11} fill="#0df5c4" />
              </div>
              <span>Watch Video</span>
            </button>
          </div>
        </div>
      </main>

      <div
        className={`relative z-20 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-5 flex items-center justify-between text-xs ${
          isDark ? 'text-[#71958b]' : 'text-emerald-800/50'
        }`}
      >
        <div
          className={`flex items-center gap-2 tracking-[0.22em] font-mono text-[11px] font-semibold ${
            isDark ? 'text-[#8eb6a9]' : 'text-emerald-800/60'
          }`}
        >
          <span className="w-0.5 h-3.5 bg-[#0df5c4]" />
          <span>GLOBAL TALENT. REAL IMPACT.</span>
        </div>
        <span className="hidden sm:inline">© {new Date().getFullYear()} Global Solutions</span>
      </div>

      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div
            className={`fixed inset-0 backdrop-blur-xl ${isDark ? 'bg-[#010c09]/85' : 'bg-white/70'}`}
            onClick={() => setShowVideoModal(false)}
          />
          <div
            className={`relative z-10 w-full max-w-2xl rounded-3xl p-6 sm:p-8 border shadow-2xl ${
              isDark
                ? 'bg-[#031d17]/95 border-[#0df5c4]/40 text-white'
                : 'bg-white border-emerald-200 text-emerald-950'
            }`}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0df5c4]/20 text-[#0df5c4] flex items-center justify-center">
                  <Play size={16} fill="#0df5c4" />
                </div>
                <h3 className="text-lg font-bold font-display">Platform Overview</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-emerald-50 hover:bg-emerald-100'
                }`}
              >
                <X size={16} />
              </button>
            </div>
            <div
              className={`relative aspect-video rounded-2xl overflow-hidden border flex flex-col items-center justify-center p-6 text-center ${
                isDark ? 'bg-[#011410] border-[#0df5c4]/20' : 'bg-emerald-50 border-emerald-100'
              }`}
            >
              <div className="w-16 h-16 rounded-full bg-[#0df5c4]/15 border border-[#0df5c4]/40 flex items-center justify-center text-[#0df5c4] mb-3">
                <Play size={28} fill="#0df5c4" />
              </div>
              <p className="text-sm font-semibold">Global Solutions — Workforce Allocation Platform</p>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold ${
                  isDark ? 'text-[#8cb2a6] hover:text-white' : 'text-emerald-700'
                }`}
              >
                Close
              </button>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf]"
              >
                Proceed to Login
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
