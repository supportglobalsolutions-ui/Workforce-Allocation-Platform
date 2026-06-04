'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Trophy, Award, Flame, Search, ShieldCheck } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  country: 'KE' | 'UK' | 'NG';
  hoursThisPeriod: number;
  qualityScore: number;
  reliabilityRate: number;
  streak: number;
}

const leaderboardData: LeaderboardEntry[] = [
  { rank: 1, id: 'W-009', name: 'Alina Popescu', country: 'UK', hoursThisPeriod: 260.5, qualityScore: 98, reliabilityRate: 100, streak: 15 },
  { rank: 2, id: 'W-015', name: 'Ndirangu Mwangi', country: 'KE', hoursThisPeriod: 255.0, qualityScore: 96, reliabilityRate: 98, streak: 12 },
  { rank: 3, id: 'W-034', name: 'Chinedu Okafor', country: 'NG', hoursThisPeriod: 250.2, qualityScore: 94, reliabilityRate: 97, streak: 8 },
  { rank: 4, id: 'W-001', name: 'Kibiru Kelvin', country: 'KE', hoursThisPeriod: 245.5, qualityScore: 92, reliabilityRate: 98, streak: 10 }, // Current user
  { rank: 5, id: 'W-045', name: 'Jane Doe', country: 'NG', hoursThisPeriod: 180.2, qualityScore: 78, reliabilityRate: 85, streak: 2 },
  { rank: 6, id: 'W-051', name: 'David Smith', country: 'UK', hoursThisPeriod: 155.0, qualityScore: 84, reliabilityRate: 90, streak: 0 },
  { rank: 7, id: 'W-088', name: 'Sarah Jenkins', country: 'UK', hoursThisPeriod: 94.0, qualityScore: 65, reliabilityRate: 70, streak: 0 },
];

export default function WorkerLeaderboard() {
  const [data] = useState<LeaderboardEntry[]>(leaderboardData);
  const [regionFilter, setRegionFilter] = useState('ALL');

  const filteredData = regionFilter === 'ALL' 
    ? data 
    : data.filter(d => d.country === regionFilter);

  return (
    <DashboardLayout role="worker">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight leading-none">Global Leaderboards</h2>
          <p className="text-[#bbcac2] mt-2 text-sm font-sans">Compete with global solutions peers based on hours verified and rolling quality index metrics.</p>
        </div>
      </header>

      {/* Highlights for current user */}
      <div className="glass-panel p-6 rounded-3xl border border-[#e9c349]/30 bg-gradient-to-r from-[#001712] via-[#08241e]/50 to-[#001712] mb-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        {/* Glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#e9c349]/[0.03] rounded-full blur-[40px] pointer-events-none" />

        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#af8d11] to-[#e9c349] flex items-center justify-center font-black text-[#3c2f00] text-3xl shadow-[0_0_20px_rgba(233,195,115,0.2)]">
            #4
          </div>
          <div>
            <h3 className="text-lg font-black text-white leading-tight">You are in 4th place globally</h3>
            <p className="text-[#bbcac2] text-xs font-medium mt-1 leading-snug">Kibiru Kelvin • Maintain your active daily streak to climb higher.</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 text-center min-w-24">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Rolling Streak</span>
            <span className="text-sm font-black text-[#e9c349] font-mono flex items-center justify-center gap-1 mt-1">
              <Flame size={12} className="text-[#e9c349] fill-[#e9c349]" />
              10 Days
            </span>
          </div>
          <div className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 text-center min-w-24">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Quality Index</span>
            <span className="text-sm font-black text-[#61e3bb] font-mono block mt-1">92.0</span>
          </div>
        </div>
      </div>

      {/* Control bar */}
      <div className="glass-panel p-4 rounded-2xl flex items-center justify-between mb-6">
        <div className="flex gap-1">
          {['ALL', 'KE', 'NG', 'UK'].map((c) => (
            <button
              key={c}
              onClick={() => setRegionFilter(c)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                regionFilter === c 
                  ? 'bg-[#142f28] text-[#61e3bb] border border-[#61e3bb]/30' 
                  : 'text-[#bbcac2] hover:text-white hover:bg-white/[0.02]'
              }`}
            >
              {c === 'ALL' ? 'Global Leaderboard' : `${c} Standings`}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard list */}
      <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-medium">
            <thead className="bg-[#00110d]/40 text-[#bbcac2] font-bold border-b border-white/5 uppercase font-mono text-[10px]">
              <tr>
                <th className="p-4">Standing Rank</th>
                <th className="p-4">Personnel Member</th>
                <th className="p-4">Active Region</th>
                <th className="p-4">Hours this Period</th>
                <th className="p-4">Quality Index Score</th>
                <th className="p-4">Reliability Index</th>
                <th className="p-4 text-right">Streak Standing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredData.map((d) => {
                const isCurrentUser = d.id === 'W-001';
                return (
                  <tr 
                    key={d.id} 
                    className={`transition-colors ${
                      isCurrentUser 
                        ? 'bg-[#e9c349]/5 hover:bg-[#e9c349]/10' 
                        : 'hover:bg-white/[0.01]'
                    }`}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {d.rank <= 3 ? (
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                            d.rank === 1 ? 'bg-[#e9c349] text-[#3c2f00]' : d.rank === 2 ? 'bg-[#96d3ba] text-[#002116]' : 'bg-[#cbe9df] text-slate-800'
                          }`}>
                            {d.rank}
                          </div>
                        ) : (
                          <span className="font-mono text-slate-500 font-bold ml-2">{d.rank}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white block">{d.name}</span>
                        {isCurrentUser && (
                          <span className="px-1.5 py-0.5 bg-[#e9c349]/10 border border-[#e9c349]/30 text-[#e9c349] rounded text-[8px] font-bold uppercase tracking-wider font-mono">
                            YOU
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 font-bold text-slate-400">{d.country} Region</td>
                    <td className="p-4 font-mono text-slate-300">{d.hoursThisPeriod.toFixed(1)} hrs</td>
                    <td className="p-4">
                      <span className="font-mono font-bold text-[#61e3bb]">{d.qualityScore}</span>
                    </td>
                    <td className="p-4 font-mono text-slate-400">{d.reliabilityRate}%</td>
                    <td className="p-4 text-right">
                      {d.streak > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[#e9c349] font-bold font-mono text-xs">
                          <Flame size={12} className="fill-[#e9c349]" />
                          {d.streak}d
                        </span>
                      ) : (
                        <span className="text-slate-600 font-mono">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
