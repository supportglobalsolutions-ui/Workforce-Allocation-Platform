'use client';

import { Users, TrendingUp, MapPin, ShieldCheck, Zap, Globe2 } from 'lucide-react';

type ImpactCard = {
  id: string;
  country: string;
  region: string;
  title: string;
  body: string;
  icon: 'shield' | 'zap' | 'globe' | 'pin';
  position: string;
  line: { x1: number; y1: number; x2: number; y2: number };
};

const IMPACT_CARDS: ImpactCard[] = [
  {
    id: 'kenya',
    country: 'Kenya',
    region: 'East Africa',
    title: 'Always-on remote ops',
    body: 'Global Solutions keeps delivery hubs synchronized with live capacity, payroll clarity, and zero downtime handoffs.',
    icon: 'zap',
    position:
      'absolute left-0 top-[38%] z-30 w-[min(100%,210px)] sm:w-[230px] hidden sm:block',
    line: { x1: 18, y1: 48, x2: 36, y2: 52 },
  },
  {
    id: 'nigeria',
    country: 'Nigeria',
    region: 'West Africa',
    title: 'Talent that scales',
    body: 'Skilled professionals connected, assessed, and ready — one platform from Lagos to every client timezone.',
    icon: 'globe',
    position:
      'absolute right-0 top-[42%] z-30 w-[min(100%,210px)] sm:w-[230px] hidden sm:block',
    line: { x1: 82, y1: 52, x2: 64, y2: 55 },
  },
  {
    id: 'uganda',
    country: 'Uganda',
    region: 'East Africa',
    title: 'Secure workforce control',
    body: 'Audited sessions, role-safe access, and credential-free RDP — security that travels with every seat.',
    icon: 'shield',
    position:
      'absolute left-[2%] bottom-[4%] z-30 w-[min(100%,210px)] sm:w-[230px] hidden md:block',
    line: { x1: 22, y1: 82, x2: 40, y2: 68 },
  },
  {
    id: 'india',
    country: 'India',
    region: 'South Asia',
    title: 'Follow-the-sun delivery',
    body: 'Cross-timezone projects stay continuous — quality scored, shifts aligned, impact measured worldwide.',
    icon: 'pin',
    position:
      'absolute right-[1%] bottom-[6%] z-30 w-[min(100%,210px)] sm:w-[230px] hidden md:block',
    line: { x1: 78, y1: 78, x2: 60, y2: 66 },
  },
];

function CardIcon({ type }: { type: ImpactCard['icon'] }) {
  const cls = 'text-[#0df5c4]';
  if (type === 'shield') return <ShieldCheck size={16} className={cls} />;
  if (type === 'zap') return <Zap size={16} className={cls} />;
  if (type === 'globe') return <Globe2 size={16} className={cls} />;
  return <MapPin size={16} className={cls} />;
}

/** HQ globe with country impact cards (praise Global Solutions — no people profiles). */
export default function GlobeShowcase() {
  return (
    <div className="relative w-full max-w-[620px] mx-auto aspect-square select-none">
      <div className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle,rgba(13,245,196,0.32)_0%,rgba(13,245,196,0.08)_45%,transparent_70%)] blur-2xl pointer-events-none" />

      {/* Sharp HQ globe — circular crop, high-res asset */}
      <div className="absolute inset-[8%] sm:inset-[6%] rounded-full overflow-hidden shadow-[0_0_90px_rgba(13,245,196,0.4)] ring-1 ring-[#0df5c4]/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/landing-globe-hq.png"
          alt="Global Solutions network globe"
          className="w-full h-full object-cover object-center scale-[1.08]"
          draggable={false}
        />
        <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_50px_rgba(13,245,196,0.4)] border border-[#0df5c4]/25" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.12)_0%,transparent_45%)] pointer-events-none" />
      </div>

      {/* Lines from globe edge out to country cards */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-20 hidden sm:block"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="lineGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0df5c4" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0df5c4" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        {IMPACT_CARDS.map((card) => (
          <g key={card.id}>
            <line
              x1={card.line.x1}
              y1={card.line.y1}
              x2={card.line.x2}
              y2={card.line.y2}
              stroke="url(#lineGlow)"
              strokeWidth="0.4"
              strokeLinecap="round"
            />
            <circle cx={card.line.x2} cy={card.line.y2} r="0.85" fill="#0df5c4" opacity="0.95" />
            <circle cx={card.line.x1} cy={card.line.y1} r="0.65" fill="#0df5c4" opacity="0.8" />
          </g>
        ))}
      </svg>

      {/* Stat: Global Teams */}
      <div className="absolute top-[4%] left-0 z-30 p-3 sm:p-3.5 pr-4 rounded-2xl bg-[#031d17]/92 backdrop-blur-xl border border-[#0df5c4]/35 shadow-[0_0_30px_rgba(13,245,196,0.22)] flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0df5c4]/15 border border-[#0df5c4]/30 flex items-center justify-center shrink-0 text-[#0df5c4]">
          <Users size={18} />
        </div>
        <div>
          <div className="text-[10px] text-[#98b7af] font-medium tracking-wide">Global Teams</div>
          <div className="text-lg sm:text-xl font-bold font-display text-white leading-tight">50+</div>
          <div className="text-[9px] text-[#71958b]">Countries</div>
        </div>
      </div>

      {/* Stat: Talent Access */}
      <div className="absolute top-[8%] right-0 z-30 p-3 sm:p-3.5 pr-4 rounded-2xl bg-[#031d17]/92 backdrop-blur-xl border border-[#0df5c4]/35 shadow-[0_0_30px_rgba(13,245,196,0.22)] flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0df5c4]/15 border border-[#0df5c4]/30 flex items-center justify-center shrink-0 text-[#0df5c4]">
          <TrendingUp size={18} />
        </div>
        <div>
          <div className="text-[10px] text-[#98b7af] font-medium tracking-wide">Talent Access</div>
          <div className="text-lg sm:text-xl font-bold font-display text-white leading-tight">2,840+</div>
          <div className="text-[9px] text-[#71958b]">Skilled Professionals</div>
        </div>
      </div>

      {/* Country impact cards — Global Solutions wins by region */}
      {IMPACT_CARDS.map((card) => (
        <div
          key={card.id}
          className={`${card.position} p-3 sm:p-3.5 rounded-2xl bg-[#031d17]/92 backdrop-blur-xl border border-[#0df5c4]/35 shadow-[0_0_28px_rgba(13,245,196,0.2)]`}
        >
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0df5c4]/12 border border-[#0df5c4]/30 flex items-center justify-center shrink-0">
              <CardIcon type={card.icon} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#0df5c4]">
                  {card.country}
                </span>
                <span className="text-[9px] text-[#71958b]">{card.region}</span>
              </div>
              <div className="text-xs sm:text-[13px] font-bold text-white leading-snug">
                {card.title}
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#98b7af] leading-relaxed mt-1">
                {card.body}
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Mobile-only compact strip when floating cards are hidden */}
      <div className="sm:hidden absolute inset-x-0 bottom-0 z-30 flex gap-2 overflow-x-auto pb-1">
        {IMPACT_CARDS.slice(0, 2).map((card) => (
          <div
            key={`m-${card.id}`}
            className="min-w-[70%] p-3 rounded-2xl bg-[#031d17]/92 backdrop-blur-xl border border-[#0df5c4]/35"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0df5c4]">
              {card.country}
            </div>
            <div className="text-xs font-bold text-white mt-0.5">{card.title}</div>
            <p className="text-[10px] text-[#98b7af] mt-1 leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
