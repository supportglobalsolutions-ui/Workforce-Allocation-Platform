'use client';

import LandingNavbar from '@/components/landing/LandingNavbar';
import LoginCard from '@/components/landing/LoginCard';
import {
  GlobalWorkforceCard,
  GlobalReachCard,
  RemoteTeamsCard,
  ProjectsDeliveredCard,
  FeaturePillList,
} from '@/components/landing/FloatingWidgets';

export default function LoginPage() {
  return (
    <div className="relative min-h-screen w-full flex flex-col bg-[#010e0b] text-white overflow-x-hidden selection:bg-[#0df5c4]/30 selection:text-white">
      {/* Background Cyber Earth & Ray Atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {/* Deep ambient glow */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[1100px] h-[550px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(13,245,196,0.12)_0%,rgba(3,40,32,0.06)_50%,transparent_80%)] blur-3xl" />
        
        {/* Diagonal cyber light streaks */}
        <div className="absolute -top-10 -left-32 w-[500px] h-[250px] rotate-[-25deg] bg-gradient-to-r from-transparent via-[#0df5c4]/10 to-transparent blur-2xl" />
        <div className="absolute top-1/4 -right-32 w-[600px] h-[300px] rotate-[-30deg] bg-gradient-to-r from-transparent via-[#0df5c4]/8 to-transparent blur-2xl" />

        {/* Curved luminous Earth Horizon at the bottom (matching Image 1) */}
        <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[1400px] h-[600px] rounded-[100%] bg-[radial-gradient(ellipse_at_center,#062b23_0%,#02120e_55%,#010a08_100%)] border-t border-[#0df5c4]/30 shadow-[0_-20px_80px_rgba(13,245,196,0.15)] opacity-90" />

        {/* Star grid / node coordinates */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(13,245,196,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(13,245,196,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      </div>

      {/* Top Navbar */}
      <LandingNavbar variant="login" />

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-14">
        {/* Welcome Header */}
        <div className="text-center max-w-xl mx-auto mb-8 sm:mb-10">
          <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#0df5c4] mb-2">
            WELCOME TO
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-extrabold text-white tracking-tight leading-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-[#d2fbf1] to-[#0df5c4] drop-shadow-[0_0_25px_rgba(13,245,196,0.3)]">
              Global Solutions
            </span>
          </h1>
          <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.25em] text-[#0df5c4] mt-2">
            REMOTE • SMART • GLOBAL
          </p>
          <p className="text-xs sm:text-sm text-[#8cb2a6] mt-2 max-w-md mx-auto">
            Connect talent. Empower teams. Build a smarter, more connected world.
          </p>
        </div>

        {/* Central Display: Login Card + Floating Surrounding Widgets (Image 1 Layout) */}
        <div className="relative w-full max-w-6xl mx-auto flex items-center justify-center">
          {/* Left Column Widgets (Large screens) */}
          <div className="hidden xl:flex flex-col gap-8 w-72 shrink-0 pr-4">
            <GlobalWorkforceCard className="hover:scale-[1.02] transition-transform" />
            <GlobalReachCard className="hover:scale-[1.02] transition-transform" />
          </div>

          {/* Central Login Card (with autofilled Super Admin) */}
          <div className="w-full flex justify-center px-2">
            <LoginCard />
          </div>

          {/* Right Column Widgets (Large screens) */}
          <div className="hidden xl:flex flex-col gap-5 w-72 shrink-0 pl-4">
            <RemoteTeamsCard className="hover:scale-[1.02] transition-transform" />
            <ProjectsDeliveredCard className="hover:scale-[1.02] transition-transform" />
            <FeaturePillList />
          </div>
        </div>

        {/* Responsive Grid for tablets/mobile below the card */}
        <div className="xl:hidden w-full max-w-md mt-10 space-y-4">
          <GlobalWorkforceCard />
          <RemoteTeamsCard />
        </div>
      </main>
    </div>
  );
}
