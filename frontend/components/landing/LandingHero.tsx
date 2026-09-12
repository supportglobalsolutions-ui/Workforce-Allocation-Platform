'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Play, X, Shield, Globe, Users, ExternalLink } from 'lucide-react';
import LandingNavbar from './LandingNavbar';
import HoloGlobe from './HoloGlobe';

export default function LandingHero() {
  const [showVideoModal, setShowVideoModal] = useState(false);

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between bg-[#010c09] text-white overflow-x-hidden selection:bg-[#0df5c4]/30 selection:text-white">
      {/* ── Background Cyber Atmosphere with High-Resolution Render ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {/* Cinematic 3D Backdrop containing city skyline, lighting streaks & reflective floor */}
        <div
          className="absolute inset-0 bg-[url('/images/landing-art-bg.png')] bg-cover bg-center opacity-85"
          style={{ mixBlendMode: 'screen' }}
        />

        {/* Diagonal volumetric cyan beam of light across the screen */}
        <div className="absolute -top-32 -left-40 w-[700px] h-[350px] rotate-[-25deg] bg-gradient-to-r from-transparent via-[#0df5c4]/15 to-transparent blur-3xl" />
        <div className="absolute top-1/2 -right-40 w-[800px] h-[400px] rotate-[-30deg] bg-gradient-to-r from-transparent via-[#0df5c4]/12 to-transparent blur-3xl" />

        {/* Ambient radial depth aura */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[1100px] h-[600px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(13,245,196,0.1)_0%,rgba(3,40,32,0.05)_50%,transparent_75%)] blur-3xl" />

        {/* Perspective floor grid reflections */}
        <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-[#010c09] via-transparent to-transparent pointer-events-none" />
      </div>

      {/* ── Top Navigation Bar ── */}
      <LandingNavbar onOpenVideo={() => setShowVideoModal(true)} />

      {/* ── Main Hero Content Matching Screenshot Exactly ── */}
      <main className="relative z-10 flex-1 flex items-center w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          
          {/* ── Left Column: Typography, Subhead & Action Buttons ── */}
          <div className="lg:col-span-6 flex flex-col items-start text-left z-20">
            {/* Tagline */}
            <div className="text-[11px] sm:text-xs font-mono font-bold uppercase tracking-[0.28em] text-[#0df5c4] mb-3 sm:mb-4 drop-shadow-[0_0_12px_rgba(13,245,196,0.5)]">
              REMOTE • SMART • GLOBAL
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl sm:text-7xl lg:text-[76px] font-display font-extrabold tracking-tight leading-[1.04] mb-5 sm:mb-6">
              <span className="text-white block drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
                Global
              </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0df5c4] via-[#4df8cf] to-[#14e9b6] drop-shadow-[0_0_35px_rgba(13,245,196,0.6)]">
                Solutions
              </span>
            </h1>

            {/* Subhead */}
            <p className="text-lg sm:text-2xl font-display font-semibold text-[#ddf5ee] tracking-tight leading-snug mb-2 sm:mb-3 max-w-lg">
              Build remote teams. Unlock global talent.
            </p>
            <p className="text-lg sm:text-2xl font-display font-semibold text-[#ddf5ee] tracking-tight leading-snug mb-8 sm:mb-9 max-w-lg">
              Scale your business.
            </p>

            {/* Buttons Row */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-5">
              {/* Primary Call to Action: Get Started -> /login */}
              <Link
                href="/login"
                className="group relative inline-flex items-center gap-2.5 px-8 sm:px-9 py-3.5 sm:py-4 rounded-full font-bold text-sm sm:text-base text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] active:scale-95 transition-all shadow-[0_0_30px_rgba(13,245,196,0.45)] hover:shadow-[0_0_45px_rgba(13,245,196,0.7)]"
              >
                <span>Get Started</span>
                <ArrowRight
                  size={18}
                  strokeWidth={2.5}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </Link>

              {/* Secondary Call to Action: Watch Video */}
              <button
                type="button"
                onClick={() => setShowVideoModal(true)}
                className="group inline-flex items-center gap-2.5 px-7 sm:px-8 py-3.5 sm:py-4 rounded-full font-semibold text-sm sm:text-base text-white bg-[#03201a]/70 hover:bg-[#032820] border border-[#0df5c4]/30 hover:border-[#0df5c4]/60 transition-all shadow-[0_0_20px_rgba(13,245,196,0.15)] active:scale-95"
              >
                <div className="w-5 h-5 rounded-full bg-[#0df5c4]/20 flex items-center justify-center text-[#0df5c4] group-hover:scale-110 transition-transform">
                  <Play size={11} fill="#0df5c4" />
                </div>
                <span>Watch Video</span>
              </button>
            </div>
          </div>

          {/* ── Right Column: Holographic Globe & 4 Badges ── */}
          <div className="lg:col-span-6 flex items-center justify-center z-10 w-full mt-6 lg:mt-0">
            <HoloGlobe />
          </div>
        </div>
      </main>

      {/* ── Bottom Left Brand Signature ── */}
      <div className="relative z-20 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-5 flex items-center justify-between text-xs text-[#71958b]">
        <div className="flex items-center gap-2 tracking-[0.22em] font-mono text-[11px] font-semibold text-[#8eb6a9]">
          <span className="w-0.5 h-3.5 bg-[#0df5c4]" />
          <span>GLOBAL TALENT. REAL IMPACT.</span>
        </div>

        <div className="hidden sm:flex items-center gap-4 text-[11px] text-[#71958b]">
          <span>© 2026 Global Solutions</span>
          <span>•</span>
          <Link href="/login" className="text-[#0df5c4] hover:underline font-semibold">
            Sign In to Platform →
          </Link>
        </div>
      </div>

      {/* ── Video Preview Walkthrough Modal ── */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div
            className="fixed inset-0 bg-[#010c09]/85 backdrop-blur-xl"
            onClick={() => setShowVideoModal(false)}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-3xl p-6 sm:p-8 bg-[#031d17]/95 border border-[#0df5c4]/40 shadow-[0_0_60px_rgba(13,245,196,0.3)] text-white">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0df5c4]/20 text-[#0df5c4] flex items-center justify-center">
                  <Play size={16} fill="#0df5c4" />
                </div>
                <h3 className="text-lg font-bold font-display text-white">
                  Platform Overview & Workforce Tour
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Video Placeholder Showcase */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-[#011410] border border-[#0df5c4]/20 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-[#0df5c4]/15 border border-[#0df5c4]/40 flex items-center justify-center text-[#0df5c4] mb-3 animate-pulse">
                <Play size={28} fill="#0df5c4" />
              </div>
              <p className="text-sm font-semibold text-white">
                Global Solutions — Workforce Allocation Platform
              </p>
              <p className="text-xs text-[#8cb2a6] mt-1 max-w-sm">
                Explore real-time RDP machine allocation, automated payroll calculation, live
                audits, and team leaderboards.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8cb2a6] hover:text-white"
              >
                Close
              </button>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold text-[#01241c] bg-[#0df5c4] hover:bg-[#34f8cf] transition-all shadow-[0_0_15px_rgba(13,245,196,0.4)]"
              >
                <span>Proceed to Login</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
