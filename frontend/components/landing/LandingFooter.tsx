'use client';

import LiveDateTime from './LiveDateTime';

const SPECTRE_TECH_URL = 'https://spectretechltd.com';

export default function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-20 shrink-0 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-3 sm:py-4 grid grid-cols-1 sm:grid-cols-3 items-center gap-2 sm:gap-3 text-xs text-[#9eb9ae]">
      <div className="flex items-center justify-center sm:justify-start order-first sm:order-none">
        <LiveDateTime className="text-xs sm:text-sm font-mono font-semibold tracking-wide text-[#b7c9c2]" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <a
          href={SPECTRE_TECH_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-display text-[10px] tracking-tight text-[#d4af37] hover:text-[#0df5c4] transition-colors"
        >
          Powered by Spectre Tech Limited
        </a>
      </div>
      <div className="flex flex-col items-center sm:items-end gap-0.5 text-center sm:text-right">
        <span className="font-display text-[11px] tracking-tight text-[#d4af37]">© {year} Global Solutions</span>
        <span className="font-display text-[10px] tracking-tight text-[#9eb9ae]">All rights reserved.</span>
      </div>
    </footer>
  );
}
