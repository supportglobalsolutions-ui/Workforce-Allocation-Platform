'use client';

import { ReactNode } from 'react';
import LandingNavbar from './LandingNavbar';
import LandingFooter from './LandingFooter';

/** Shared auth shell — same cinematic cyber background as landing. */
export default function AuthPageShell({
  children,
  header,
  navVariant = 'login',
}: {
  children: ReactNode;
  header?: ReactNode;
  navVariant?: 'login' | 'contact';
}) {
  return (
    <div className="force-dark-page relative h-dvh max-h-dvh w-full flex flex-col overflow-hidden bg-[#010c09] text-white selection:bg-[#0df5c4]/30 selection:text-white">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[url('/images/landing-cinematic-bg.png')] bg-cover bg-center bg-no-repeat" />
        <div className="absolute inset-0 bg-[#010c09]/45" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#010c09]/25 via-transparent to-[#010c09]/60" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[1100px] h-[550px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(13,245,196,0.12)_0%,transparent_70%)] blur-3xl" />
      </div>

      <div className="relative z-40 shrink-0">
        <LandingNavbar variant={navVariant} />
      </div>

      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto">
        <div className="min-h-full flex flex-col items-center justify-center px-4 sm:px-6 py-3 sm:py-5">
          {header}
          {children}
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

/** Glass card chrome for auth forms. */
export function AuthGlassCard({
  children,
  className = '',
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`relative z-20 w-full ${wide ? 'max-w-2xl' : 'max-w-[430px]'} rounded-2xl p-5 sm:p-6 transition-all bg-[#031513]/62 backdrop-blur-lg border border-[#0df5c4]/35 shadow-[0_0_60px_rgba(13,245,196,0.18)] text-white ${className}`}
    >
      <div className="absolute top-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-[#0df5c4] to-transparent opacity-70" />
      {children}
    </div>
  );
}
