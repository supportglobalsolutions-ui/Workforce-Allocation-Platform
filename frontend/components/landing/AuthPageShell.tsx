'use client';

import { ReactNode } from 'react';
import LandingNavbar from './LandingNavbar';
import { useTheme } from '@/lib/theme/ThemeProvider';

/** Shared auth shell — respects dark / light theme. */
export default function AuthPageShell({
  children,
  header,
}: {
  children: ReactNode;
  header?: ReactNode;
}) {
  const { isDark } = useTheme();

  return (
    <div
      className={`relative min-h-screen w-full flex flex-col overflow-x-hidden transition-colors ${
        isDark
          ? 'bg-[#010e0b] text-white selection:bg-[#0df5c4]/30 selection:text-white'
          : 'bg-[#f4faf7] text-emerald-950 selection:bg-emerald-500/20'
      }`}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className={`absolute inset-0 bg-[url('/images/landing-art-bg.png')] bg-cover bg-center transition-opacity duration-500 ${
            isDark ? 'opacity-50 mix-blend-screen' : 'opacity-20 mix-blend-multiply'
          }`}
        />
        {isDark ? (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-[#010e0b]/90 via-[#010e0b]/65 to-[#010e0b]/30" />
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[1100px] h-[550px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(13,245,196,0.12)_0%,rgba(3,40,32,0.06)_50%,transparent_80%)] blur-3xl" />
            <div className="absolute -top-10 -left-32 w-[500px] h-[250px] rotate-[-25deg] bg-gradient-to-r from-transparent via-[#0df5c4]/10 to-transparent blur-2xl" />
            <div className="absolute top-1/4 -right-32 w-[600px] h-[300px] rotate-[-30deg] bg-gradient-to-r from-transparent via-[#0df5c4]/8 to-transparent blur-2xl" />
            <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[1400px] h-[600px] rounded-[100%] bg-[radial-gradient(ellipse_at_center,#062b23_0%,#02120e_55%,#010a08_100%)] border-t border-[#0df5c4]/30 shadow-[0_-20px_80px_rgba(13,245,196,0.15)] opacity-90" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(13,245,196,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(13,245,196,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-[#f4faf7]/94 via-[#f4faf7]/78 to-[#f4faf7]/55" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(10,122,85,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(10,122,85,0.04)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full bg-emerald-200/40 blur-3xl" />
            <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[1200px] h-[480px] rounded-[100%] bg-gradient-to-t from-emerald-100/80 to-transparent border-t border-emerald-200/60" />
          </>
        )}
      </div>

      <LandingNavbar variant="login" />

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-14">
        {header}
        {children}
      </main>
    </div>
  );
}

/** Glass card chrome for auth forms — dark cyber or light white. */
export function AuthGlassCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const { isDark } = useTheme();

  return (
    <div
      className={`relative z-20 w-full max-w-[430px] rounded-3xl p-7 sm:p-9 transition-all ${
        isDark
          ? 'bg-[#031513]/85 backdrop-blur-2xl border border-[#0df5c4]/35 shadow-[0_0_60px_rgba(13,245,196,0.18)] text-white'
          : 'bg-white/95 backdrop-blur-xl border border-emerald-200/80 shadow-[0_20px_60px_rgba(15,31,26,0.08)] text-emerald-950'
      } ${className}`}
    >
      <div
        className={`absolute top-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent to-transparent opacity-70 ${
          isDark ? 'via-[#0df5c4]' : 'via-emerald-400'
        }`}
      />
      {children}
    </div>
  );
}
