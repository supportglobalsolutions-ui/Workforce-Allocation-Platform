'use client';

import { ReactNode } from 'react';
import LandingNavbar from './LandingNavbar';
import LiveDateTime from './LiveDateTime';

/** Shared auth shell — same cinematic cyber background as landing. */
export default function AuthPageShell({
  children,
  header,
}: {
  children: ReactNode;
  header?: ReactNode;
}) {
  return (
    <div className="force-dark-page relative min-h-screen w-full flex flex-col overflow-x-hidden bg-[#010c09] text-white selection:bg-[#0df5c4]/30 selection:text-white">
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[url('/images/landing-cinematic-bg.png')] bg-cover bg-center" />
        {/* Light veil — keep the clean globe visible like the right side of the screen */}
        <div className="absolute inset-0 bg-[#010c09]/45" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#010c09]/25 via-transparent to-[#010c09]/60" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[1100px] h-[550px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(13,245,196,0.12)_0%,transparent_70%)] blur-3xl" />
      </div>

      <LandingNavbar variant="login" />

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-14">
        {header}
        {children}
      </main>

      <footer className="relative z-20 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-5 grid grid-cols-1 sm:grid-cols-3 items-center gap-3 text-xs text-[#9eb9ae]">
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
      </footer>
    </div>
  );
}

/** Glass card chrome for auth forms. */
export function AuthGlassCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative z-20 w-full max-w-[430px] rounded-3xl p-7 sm:p-9 transition-all bg-[#031513]/62 backdrop-blur-lg border border-[#0df5c4]/35 shadow-[0_0_60px_rgba(13,245,196,0.18)] text-white ${className}`}
    >
      <div className="absolute top-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-[#0df5c4] to-transparent opacity-70" />
      {children}
    </div>
  );
}
