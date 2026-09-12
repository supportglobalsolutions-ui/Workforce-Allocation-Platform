'use client';

import { Users, Globe, CheckSquare, Zap, Shield, TrendingUp } from 'lucide-react';

export function GlobalWorkforceCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-[#031513]/85 backdrop-blur-xl border border-[#0df5c4]/30 shadow-[0_0_35px_rgba(13,245,196,0.15)] flex items-center gap-4 text-white ${className}`}
    >
      <div className="w-10 h-10 rounded-xl bg-[#0df5c4]/15 border border-[#0df5c4]/30 flex items-center justify-center shrink-0 text-[#0df5c4]">
        <Users size={19} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-[#98b7af] font-medium tracking-wide">Global Workforce</div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-xl sm:text-2xl font-bold font-display text-white">2,840</span>
          <span className="text-[10px] font-semibold text-[#0df5c4] bg-[#0df5c4]/15 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
            ↑ 12%
          </span>
        </div>
        <div className="text-[10px] text-[#71958b] mt-0.5">Active Team Members</div>
      </div>
      {/* Mini vertical bar chart */}
      <div className="flex items-end gap-1 h-8 shrink-0 pl-2">
        <span className="w-1.5 h-3.5 bg-[#0df5c4]/40 rounded-full" />
        <span className="w-1.5 h-5 bg-[#0df5c4]/60 rounded-full" />
        <span className="w-1.5 h-4 bg-[#0df5c4]/50 rounded-full" />
        <span className="w-1.5 h-7 bg-[#0df5c4] rounded-full shadow-[0_0_8px_#0df5c4]" />
        <span className="w-1.5 h-6 bg-[#0df5c4]/80 rounded-full" />
      </div>
    </div>
  );
}

export function GlobalReachCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-[#031513]/85 backdrop-blur-xl border border-[#0df5c4]/30 shadow-[0_0_35px_rgba(13,245,196,0.15)] flex items-center justify-between gap-4 text-white ${className}`}
    >
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-[#0df5c4]/15 border border-[#0df5c4]/30 flex items-center justify-center shrink-0 text-[#0df5c4]">
          <Globe size={19} />
        </div>
        <div>
          <div className="text-[11px] text-[#98b7af] font-medium">Global Reach</div>
          <div className="text-xl sm:text-2xl font-bold font-display text-white mt-0.5">12+</div>
          <div className="text-[10px] text-[#71958b]">Countries</div>
        </div>
      </div>
      {/* Mini stylized world map svg */}
      <div className="opacity-70 text-[#0df5c4]">
        <svg width="56" height="32" viewBox="0 0 56 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="14" r="2.5" fill="#0df5c4" />
          <circle cx="28" cy="10" r="2.5" fill="#0df5c4" />
          <circle cx="44" cy="18" r="2.5" fill="#0df5c4" />
          <path d="M10 14Q19 6 28 10T44 18" stroke="#0df5c4" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        </svg>
      </div>
    </div>
  );
}

export function RemoteTeamsCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-[#031513]/85 backdrop-blur-xl border border-[#0df5c4]/30 shadow-[0_0_35px_rgba(13,245,196,0.15)] flex items-center justify-between gap-4 text-white ${className}`}
    >
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-[#0df5c4]/15 border border-[#0df5c4]/30 flex items-center justify-center shrink-0 text-[#0df5c4]">
          <Users size={19} />
        </div>
        <div>
          <div className="text-[11px] text-[#98b7af] font-medium">Remote Teams</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-xl sm:text-2xl font-bold font-display text-white">98%</span>
            <span className="text-[10px] font-semibold text-[#0df5c4] bg-[#0df5c4]/15 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
              ↑ 5%
            </span>
          </div>
          <div className="text-[10px] text-[#71958b]">Team Productivity</div>
        </div>
      </div>
      {/* Radial progress ring at 98% */}
      <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
        <svg className="w-11 h-11 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="14" fill="none" stroke="#043228" strokeWidth="3.5" />
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="#0df5c4"
            strokeWidth="3.5"
            strokeDasharray="88 100"
            strokeLinecap="round"
            className="drop-shadow-[0_0_6px_#0df5c4]"
          />
        </svg>
      </div>
    </div>
  );
}

export function ProjectsDeliveredCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-[#031513]/85 backdrop-blur-xl border border-[#0df5c4]/30 shadow-[0_0_35px_rgba(13,245,196,0.15)] flex items-center justify-between gap-4 text-white ${className}`}
    >
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-[#0df5c4]/15 border border-[#0df5c4]/30 flex items-center justify-center shrink-0 text-[#0df5c4]">
          <CheckSquare size={19} />
        </div>
        <div>
          <div className="text-[11px] text-[#98b7af] font-medium">Projects Delivered</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-xl sm:text-2xl font-bold font-display text-white">156</span>
            <span className="text-[10px] font-semibold text-[#0df5c4] bg-[#0df5c4]/15 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
              ↑ 18%
            </span>
          </div>
          <div className="text-[10px] text-[#71958b]">This Month</div>
        </div>
      </div>
      {/* Mini line sparkline graph */}
      <div className="w-16 h-8 shrink-0">
        <svg width="64" height="32" viewBox="0 0 64 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M2 28L16 22L30 25L44 14L62 4"
            stroke="#0df5c4"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-[0_0_8px_#0df5c4]"
          />
          <path
            d="M2 28L16 22L30 25L44 14L62 4V32H2Z"
            fill="url(#spark_grad)"
            opacity="0.3"
          />
          <defs>
            <linearGradient id="spark_grad" x1="32" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0df5c4" />
              <stop offset="1" stopColor="#0df5c4" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

export function FeaturePillList({ className = '' }: { className?: string }) {
  const items = [
    {
      icon: Zap,
      title: 'Flexible Work',
      subtitle: 'Work from anywhere',
    },
    {
      icon: Shield,
      title: 'Secure & Reliable',
      subtitle: 'Your data, our priority',
    },
    {
      icon: Globe,
      title: 'Global Opportunities',
      subtitle: 'Talent without borders',
    },
  ];

  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-3.5 p-3 px-4 rounded-xl bg-[#031513]/70 backdrop-blur-md border border-[#0df5c4]/20 hover:border-[#0df5c4]/40 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-[#0df5c4]/15 flex items-center justify-center shrink-0 text-[#0df5c4]">
            <item.icon size={16} />
          </div>
          <div>
            <div className="text-xs font-semibold text-white">{item.title}</div>
            <div className="text-[11px] text-[#71958b]">{item.subtitle}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TalentBadge({
  role,
  location,
  status = 'Online',
  avatarUrl,
  className = '',
}: {
  role: string;
  location: string;
  status?: string;
  avatarUrl: string;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-3 p-2.5 pr-4 rounded-2xl bg-[#031815]/90 backdrop-blur-xl border border-[#0df5c4]/40 shadow-[0_0_25px_rgba(13,245,196,0.25)] transition-transform hover:scale-105 ${className}`}
    >
      <div className="relative w-9 h-9 rounded-xl overflow-hidden border border-[#0df5c4]/50 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={role} className="w-full h-full object-cover" />
      </div>
      <div>
        <div className="text-xs font-bold text-white tracking-tight">{role}</div>
        <div className="text-[10px] text-[#98b7af]">{location}</div>
        <div className="flex items-center gap-1 text-[9px] font-semibold text-[#0df5c4] mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0df5c4] shadow-[0_0_6px_#0df5c4] animate-pulse" />
          <span>{status}</span>
        </div>
      </div>
    </div>
  );
}
