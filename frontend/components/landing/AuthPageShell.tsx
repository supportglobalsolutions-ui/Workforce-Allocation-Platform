'use client';

import { ReactNode } from 'react';
import LandingNavbar from './LandingNavbar';

/** Shared cyber background used by login / signup / reset-password pages. */
export default function AuthPageShell({
  children,
  header,
}: {
  children: ReactNode;
  header?: ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full flex flex-col bg-[#010e0b] text-white overflow-x-hidden selection:bg-[#0df5c4]/30 selection:text-white">
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[1100px] h-[550px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(13,245,196,0.12)_0%,rgba(3,40,32,0.06)_50%,transparent_80%)] blur-3xl" />
        <div className="absolute -top-10 -left-32 w-[500px] h-[250px] rotate-[-25deg] bg-gradient-to-r from-transparent via-[#0df5c4]/10 to-transparent blur-2xl" />
        <div className="absolute top-1/4 -right-32 w-[600px] h-[300px] rotate-[-30deg] bg-gradient-to-r from-transparent via-[#0df5c4]/8 to-transparent blur-2xl" />
        <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[1400px] h-[600px] rounded-[100%] bg-[radial-gradient(ellipse_at_center,#062b23_0%,#02120e_55%,#010a08_100%)] border-t border-[#0df5c4]/30 shadow-[0_-20px_80px_rgba(13,245,196,0.15)] opacity-90" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(13,245,196,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(13,245,196,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      </div>

      <LandingNavbar variant="login" />

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-14">
        {header}
        {children}
      </main>
    </div>
  );
}

/** Glass card chrome matching LoginCard (visual theme only — fonts stay per-page). */
export function AuthGlassCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative z-20 w-full max-w-[430px] rounded-3xl p-7 sm:p-9 transition-all
        bg-[#031513]/85 backdrop-blur-2xl
        border border-[#0df5c4]/35 shadow-[0_0_60px_rgba(13,245,196,0.18)]
        text-white ${className}`}
    >
      <div className="absolute top-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-[#0df5c4] to-transparent opacity-70" />
      <div className="absolute -inset-[1px] -z-10 rounded-3xl bg-gradient-to-b from-[#0df5c4]/20 via-transparent to-[#0df5c4]/10 blur-sm pointer-events-none" />
      {children}
    </div>
  );
}
