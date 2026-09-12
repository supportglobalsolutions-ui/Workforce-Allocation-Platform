'use client';

import { TalentBadge } from './FloatingWidgets';
import { Users, Globe } from 'lucide-react';

export default function HoloGlobe() {
  const talents = [
    {
      role: 'Developer',
      location: 'Nairobi, KE',
      avatarUrl:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      position: 'top-2 left-[28%]',
    },
    {
      role: 'Designer',
      location: 'Lagos, NG',
      avatarUrl:
        'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80',
      position: 'top-[22%] -right-4 sm:-right-8',
    },
    {
      role: 'Marketer',
      location: 'Manila, PH',
      avatarUrl:
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
      position: 'bottom-[22%] -left-4 sm:-left-8',
    },
    {
      role: 'Analyst',
      location: 'Kigali, RW',
      avatarUrl:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      position: 'bottom-4 right-[18%]',
    },
  ];

  return (
    <div className="relative w-full max-w-[560px] aspect-square mx-auto flex items-center justify-center">
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#0df5c4]/15 via-[#0df5c4]/5 to-transparent blur-3xl pointer-events-none" />

      {/* Outer cyber ring */}
      <div className="absolute inset-6 rounded-full border border-[#0df5c4]/20 border-dashed animate-[spin_60s_linear_infinite] pointer-events-none" />
      <div className="absolute inset-12 rounded-full border border-[#0df5c4]/15 animate-[spin_40s_linear_infinite_reverse] pointer-events-none" />

      {/* Holographic Wireframe Globe SVG */}
      <div className="relative w-[340px] h-[340px] sm:w-[420px] sm:h-[420px] rounded-full flex items-center justify-center">
        {/* Core sphere radial gradient */}
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_35%,#083830_0%,#031815_60%,#010e0b_100%)] shadow-[inset_0_0_50px_rgba(13,245,196,0.35),0_0_50px_rgba(13,245,196,0.25)] border border-[#0df5c4]/40" />

        {/* Dynamic SVG Grids & Node Network */}
        <svg
          viewBox="0 0 400 400"
          className="relative z-10 w-full h-full drop-shadow-[0_0_15px_rgba(13,245,196,0.4)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Latitude lines */}
          <ellipse cx="200" cy="200" rx="190" ry="190" stroke="#0df5c4" strokeWidth="1.2" strokeOpacity="0.4" />
          <ellipse cx="200" cy="200" rx="180" ry="60" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3 3" />
          <ellipse cx="200" cy="200" rx="170" ry="120" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.35" />
          <ellipse cx="200" cy="140" rx="150" ry="50" stroke="#0df5c4" strokeWidth="0.8" strokeOpacity="0.25" />
          <ellipse cx="200" cy="260" rx="150" ry="50" stroke="#0df5c4" strokeWidth="0.8" strokeOpacity="0.25" />

          {/* Longitude meridians */}
          <ellipse cx="200" cy="200" rx="60" ry="185" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.35" />
          <ellipse cx="200" cy="200" rx="120" ry="185" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="4 4" />
          <line x1="200" y1="10" x2="200" y2="390" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.4" />
          <line x1="10" y1="200" x2="390" y2="200" stroke="#0df5c4" strokeWidth="1" strokeOpacity="0.4" />

          {/* Network Connection Trajectories */}
          <path
            d="M130 110 Q200 140 280 180"
            stroke="#0df5c4"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="animate-pulse"
          />
          <path
            d="M280 180 Q250 260 210 310"
            stroke="#0df5c4"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="animate-pulse"
          />
          <path
            d="M110 250 Q160 280 210 310"
            stroke="#0df5c4"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M130 110 Q90 190 110 250"
            stroke="#0df5c4"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Glowing continent / network nodes */}
          <circle cx="130" cy="110" r="4.5" fill="#0df5c4" className="drop-shadow-[0_0_8px_#0df5c4]" />
          <circle cx="280" cy="180" r="4.5" fill="#0df5c4" className="drop-shadow-[0_0_8px_#0df5c4]" />
          <circle cx="110" cy="250" r="4.5" fill="#0df5c4" className="drop-shadow-[0_0_8px_#0df5c4]" />
          <circle cx="210" cy="310" r="4.5" fill="#0df5c4" className="drop-shadow-[0_0_8px_#0df5c4]" />

          {/* Secondary micro nodes */}
          <circle cx="170" cy="160" r="2.5" fill="#0df5c4" opacity="0.8" />
          <circle cx="220" cy="150" r="2.5" fill="#0df5c4" opacity="0.8" />
          <circle cx="180" cy="240" r="2.5" fill="#0df5c4" opacity="0.8" />
          <circle cx="250" cy="230" r="2.5" fill="#0df5c4" opacity="0.8" />
          <circle cx="140" cy="200" r="2.5" fill="#0df5c4" opacity="0.8" />
        </svg>

        {/* Floating Talent Badges connected to nodes */}
        {talents.map((t, idx) => (
          <div key={idx} className={`absolute z-30 ${t.position}`}>
            <TalentBadge role={t.role} location={t.location} avatarUrl={t.avatarUrl} />
          </div>
        ))}
      </div>

      {/* Floating Metric Card 1: Left Growth Sparkline */}
      <div className="absolute -left-6 top-[30%] z-20 hidden lg:block p-3.5 px-4 rounded-2xl bg-[#031513]/90 backdrop-blur-xl border border-[#0df5c4]/30 shadow-[0_0_30px_rgba(13,245,196,0.18)]">
        <div className="text-[10px] text-[#98b7af] font-medium">Global Team Growth</div>
        <div className="text-xl font-bold font-display text-[#0df5c4] mt-0.5">+128%</div>
        <div className="w-20 h-6 mt-1">
          <svg width="80" height="24" viewBox="0 0 80 24" fill="none">
            <path
              d="M2 20L20 16L40 18L60 8L78 2"
              stroke="#0df5c4"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Floating Metric Card 2: Top Right Active Talent */}
      <div className="absolute -right-4 top-[8%] z-20 hidden lg:block p-3.5 px-4 rounded-2xl bg-[#031513]/90 backdrop-blur-xl border border-[#0df5c4]/30 shadow-[0_0_30px_rgba(13,245,196,0.18)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0df5c4]/15 flex items-center justify-center text-[#0df5c4]">
            <Users size={14} />
          </div>
          <div>
            <div className="text-[10px] text-[#98b7af]">Active Talent</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-white">2,840</span>
              <span className="text-[9px] font-semibold text-[#0df5c4]">↑ 12%</span>
            </div>
          </div>
        </div>
        <div className="text-[9px] text-[#71958b] mt-1">Across 50+ countries</div>
      </div>

      {/* Floating Metric Card 3: Middle Right Countries */}
      <div className="absolute -right-6 bottom-[18%] z-20 hidden lg:block p-3.5 px-4 rounded-2xl bg-[#031513]/90 backdrop-blur-xl border border-[#0df5c4]/30 shadow-[0_0_30px_rgba(13,245,196,0.18)]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#0df5c4]/15 flex items-center justify-center text-[#0df5c4]">
            <Globe size={14} />
          </div>
          <div>
            <div className="text-[10px] text-[#98b7af]">Countries</div>
            <div className="text-base font-bold text-white">50+</div>
          </div>
        </div>
        <div className="text-[9px] text-[#71958b] mt-0.5">Global Reach</div>
      </div>
    </div>
  );
}
