'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Play } from 'lucide-react';
import LandingNavbar from './LandingNavbar';
import HoloGlobe from './HoloGlobe';
import FeatureStrip from './FeatureStrip';
import WhySection from './WhySection';
import LoginModal from './LoginModal';

export default function LandingHero() {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-[#020d0a] text-white overflow-hidden selection:bg-[#0df5c4]/30 selection:text-white">
      {/* Background Cybernetic Ambience & Ray Flares */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {/* Deep space radial aura */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1200px] h-[700px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(13,245,196,0.12)_0%,rgba(3,40,32,0.06)_50%,transparent_80%)] blur-3xl" />
        
        {/* Diagonal light streak flares */}
        <div className="absolute -top-20 -left-40 w-[600px] h-[300px] rotate-[-25deg] bg-gradient-to-r from-transparent via-[#0df5c4]/10 to-transparent blur-2xl" />
        <div className="absolute top-1/3 -right-40 w-[700px] h-[350px] rotate-[-30deg] bg-gradient-to-r from-transparent via-[#0df5c4]/8 to-transparent blur-2xl" />

        {/* Cyber coordinate grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(13,245,196,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(13,245,196,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]" />
      </div>

      {/* Top Navbar */}
      <LandingNavbar onOpenLogin={() => setIsLoginModalOpen(true)} />

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center pt-8 sm:pt-14 pb-8">
        <div className="w-full max-w-7xl mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Hero Typography & Actions */}
          <div className="lg:col-span-6 flex flex-col items-start text-left z-20">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.25em] text-[#0df5c4] bg-[#03201a]/80 border border-[#0df5c4]/30 shadow-[0_0_15px_rgba(13,245,196,0.15)] mb-6">
              <span>REMOTE</span>
              <span className="text-white/40">•</span>
              <span>SMART</span>
              <span className="text-white/40">•</span>
              <span>GLOBAL</span>
            </div>

            {/* Giant Title */}
            <h1 className="text-4xl sm:text-6xl lg:text-[68px] font-display font-extrabold tracking-tight text-white leading-[1.08] mb-5">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-[#d2fbf1] to-[#0df5c4] drop-shadow-[0_0_35px_rgba(13,245,196,0.3)]">
                Global Solutions
              </span>
            </h1>

            {/* Subheading */}
            <p className="text-xl sm:text-2xl font-display font-semibold text-[#e1f5f0] tracking-tight leading-snug mb-4">
              Build remote teams. Unlock global talent. Scale your business.
            </p>

            {/* Body */}
            <p className="text-sm sm:text-base text-[#8cb2a6] leading-relaxed max-w-xl mb-8">
              Global Solutions connects you with skilled professionals from around the world,
              helping you build high-performing teams, work smarter, and achieve more — no borders,
              no limits.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => setIsLoginModalOpen(true)}
                className="group relative inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-bold text-sm text-[#01241c] bg-[#0df5c4] hover:bg-[#3bf8d1] active:scale-95 transition-all shadow-[0_0_25px_rgba(13,245,196,0.45)] hover:shadow-[0_0_35px_rgba(13,245,196,0.6)]"
              >
                <span>Get Started</span>
                <ArrowRight size={16} strokeWidth={2.5} className="group-hover:translate-x-1 transition-transform" />
              </button>

              <a
                href="#features"
                className="group inline-flex items-center gap-2.5 px-6 py-3.5 rounded-full font-semibold text-sm text-white bg-[#031d17]/80 hover:bg-[#04281f] border border-[#0df5c4]/25 hover:border-[#0df5c4]/50 transition-all shadow-[0_0_20px_rgba(13,245,196,0.1)] active:scale-95"
              >
                <div className="w-5 h-5 rounded-full bg-[#0df5c4]/20 flex items-center justify-center text-[#0df5c4]">
                  <Play size={10} fill="#0df5c4" />
                </div>
                <span>Learn More</span>
              </a>
            </div>
          </div>

          {/* Right Column: Holographic Globe & Network */}
          <div className="lg:col-span-6 flex items-center justify-center z-10 w-full">
            <HoloGlobe />
          </div>
        </div>

        {/* Feature Strip (5 Cards) */}
        <FeatureStrip />

        {/* Why Global Solutions & Partners */}
        <WhySection />
      </main>

      {/* Interactive Login Modal with Autofilled Super Admin */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </div>
  );
}
