'use client';

import { Users, TrendingUp } from 'lucide-react';

export default function HoloGlobe() {
  return (
    <div className="relative w-full max-w-[620px] aspect-square mx-auto flex items-center justify-center">
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#0df5c4]/15 via-[#0df5c4]/5 to-transparent blur-3xl pointer-events-none" />

      {/* Cybernetic outer dashed orbit rings */}
      <div className="absolute inset-4 sm:inset-6 rounded-full border border-[#0df5c4]/20 border-dashed animate-[spin_80s_linear_infinite] pointer-events-none" />
      <div className="absolute inset-10 sm:inset-14 rounded-full border border-[#0df5c4]/15 animate-[spin_50s_linear_infinite_reverse] pointer-events-none" />

      {/* Holographic Wireframe Globe */}
      <div className="relative w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] rounded-full flex items-center justify-center">
        {/* Core sphere depth gradient & luminous rim */}
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_35%,#083830_0%,#031815_60%,#010e0b_100%)] shadow-[inset_0_0_60px_rgba(13,245,196,0.35),0_0_60px_rgba(13,245,196,0.25)] border border-[#0df5c4]/40" />

        {/* Dynamic SVG Grids & Continent Nodes */}
        <svg
          viewBox="0 0 400 400"
          className="relative z-10 w-full h-full drop-shadow-[0_0_18px_rgba(13,245,196,0.45)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Latitude lines */}
          <ellipse cx="200" cy="200" rx="190" ry="190" stroke="#0df5c4" strokeWidth="1.2" strokeOpacity="0.45" />
          <ellipse cx="200" cy="200" rx="180" ry="60" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3 3" />
          <ellipse cx="200" cy="200" rx="170" ry="120" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.35" />
          <ellipse cx="200" cy="140" rx="150" ry="50" stroke="#0df5c4" strokeWidth="0.8" strokeOpacity="0.25" />
          <ellipse cx="200" cy="260" rx="150" ry="50" stroke="#0df5c4" strokeWidth="0.8" strokeOpacity="0.25" />

          {/* Longitude meridians */}
          <ellipse cx="200" cy="200" rx="60" ry="185" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.35" />
          <ellipse cx="200" cy="200" rx="120" ry="185" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="4 4" />
          <line x1="200" y1="10" x2="200" y2="390" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.4" />
          <line x1="10" y1="200" x2="390" y2="200" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.4" />

          {/* Connected Network Arcs */}
          <path
            d="M130 110 Q200 140 280 180"
            stroke="#0df5c4"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="animate-pulse"
          />
          <path
            d="M280 180 Q250 260 210 310"
            stroke="#0df5c4"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="animate-pulse"
          />
          <path
            d="M110 250 Q160 280 210 310"
            stroke="#0df5c4"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M130 110 Q90 190 110 250"
            stroke="#0df5c4"
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          {/* Glowing continent nodes */}
          <circle cx="130" cy="110" r="4.5" fill="#0df5c4" className="drop-shadow-[0_0_8px_#0df5c4]" />
          <circle cx="280" cy="180" r="4.5" fill="#0df5c4" className="drop-shadow-[0_0_8px_#0df5c4]" />
          <circle cx="110" cy="250" r="4.5" fill="#0df5c4" className="drop-shadow-[0_0_8px_#0df5c4]" />
          <circle cx="210" cy="310" r="4.5" fill="#0df5c4" className="drop-shadow-[0_0_8px_#0df5c4]" />

          {/* Micro satellite nodes */}
          <circle cx="170" cy="160" r="2.5" fill="#0df5c4" opacity="0.8" />
          <circle cx="220" cy="150" r="2.5" fill="#0df5c4" opacity="0.8" />
          <circle cx="180" cy="240" r="2.5" fill="#0df5c4" opacity="0.8" />
          <circle cx="250" cy="230" r="2.5" fill="#0df5c4" opacity="0.8" />
          <circle cx="140" cy="200" r="2.5" fill="#0df5c4" opacity="0.8" />
        </svg>

        {/* ── CARD 1 (Top Center): Global Teams 50+ Countries ── */}
        <div className="absolute -top-6 sm:-top-8 left-1/2 -translate-x-1/2 z-30 p-3 sm:p-3.5 px-4 rounded-2xl bg-[#031d17]/90 backdrop-blur-xl border border-[#0df5c4]/35 shadow-[0_0_30px_rgba(13,245,196,0.25)] hover:scale-105 transition-transform flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0df5c4]/15 border border-[#0df5c4]/30 flex items-center justify-center shrink-0 text-[#0df5c4]">
            <Users size={17} />
          </div>
          <div>
            <div className="text-[10px] text-[#98b7af] font-medium tracking-wide">Global Teams</div>
            <div className="text-base sm:text-lg font-bold font-display text-white leading-tight">50+</div>
            <div className="text-[9px] text-[#71958b]">Countries</div>
          </div>
        </div>

        {/* ── BADGE 2 (Left): Design Team Nairobi, KE • Online ── */}
        <div className="absolute top-[38%] -left-3 sm:-left-8 z-30 p-2 sm:p-2.5 pr-3.5 sm:pr-4 rounded-2xl bg-[#031d17]/90 backdrop-blur-xl border border-[#0df5c4]/35 shadow-[0_0_25px_rgba(13,245,196,0.25)] hover:scale-105 transition-transform flex items-center gap-2.5">
          <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-[#0df5c4] shrink-0 shadow-[0_0_10px_#0df5c4]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
              alt="Design Team"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="text-xs font-bold text-white tracking-tight">Design Team</div>
            <div className="text-[10px] text-[#98b7af]">Nairobi, KE</div>
            <div className="flex items-center gap-1 text-[9px] font-semibold text-[#0df5c4] mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0df5c4] shadow-[0_0_6px_#0df5c4] animate-pulse" />
              <span>Online</span>
            </div>
          </div>
        </div>

        {/* ── BADGE 3 (Right): Developer Lagos, NG • Online ── */}
        <div className="absolute bottom-[22%] -right-3 sm:-right-8 z-30 p-2 sm:p-2.5 pr-3.5 sm:pr-4 rounded-2xl bg-[#031d17]/90 backdrop-blur-xl border border-[#0df5c4]/35 shadow-[0_0_25px_rgba(13,245,196,0.25)] hover:scale-105 transition-transform flex items-center gap-2.5">
          <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-[#0df5c4] shrink-0 shadow-[0_0_10px_#0df5c4]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80"
              alt="Developer"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="text-xs font-bold text-white tracking-tight">Developer</div>
            <div className="text-[10px] text-[#98b7af]">Lagos, NG</div>
            <div className="flex items-center gap-1 text-[9px] font-semibold text-[#0df5c4] mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0df5c4] shadow-[0_0_6px_#0df5c4] animate-pulse" />
              <span>Online</span>
            </div>
          </div>
        </div>

        {/* ── CARD 4 (Top Right): Talent Access 2,840+ Skilled Professionals ── */}
        <div className="absolute -top-2 -right-4 sm:-right-12 z-30 p-3 sm:p-3.5 px-4 rounded-2xl bg-[#031d17]/90 backdrop-blur-xl border border-[#0df5c4]/35 shadow-[0_0_30px_rgba(13,245,196,0.25)] hover:scale-105 transition-transform flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0df5c4]/15 border border-[#0df5c4]/30 flex items-center justify-center shrink-0 text-[#0df5c4]">
            <TrendingUp size={17} />
          </div>
          <div>
            <div className="text-[10px] text-[#98b7af] font-medium tracking-wide">Talent Access</div>
            <div className="text-base sm:text-lg font-bold font-display text-white leading-tight">2,840+</div>
            <div className="text-[9px] text-[#71958b]">Skilled Professionals</div>
          </div>
        </div>
      </div>
    </div>
  );
}
