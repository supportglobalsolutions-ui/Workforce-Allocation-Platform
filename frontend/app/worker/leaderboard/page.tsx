'use client';

import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import { leaderboard } from '@/lib/mock-data';

export default function LeaderboardPage() {
  return (
    <div>
      <PageHeader
        title="Global Leaderboard"
        description="Rankings powered by composite quality scores — MCQ (50%) + subjective indicators (50%). Refreshes every 5 minutes."
        actions={<span className="text-xs font-mono text-emerald-accent">Updated 2m ago</span>}
      />
      <FilterBar
        filters={[
          { label: 'Scope', options: ['Global', 'Country'] },
          { label: 'Country', options: ['Kenya', 'Nigeria', 'Uganda', 'Ghana'] },
        ]}
      />
      <div className="space-y-3">
        {leaderboard.map((w) => (
          <div
            key={w.rank}
            className={`glass-panel p-4 flex items-center gap-4 transition-all ${
              w.rank <= 3 ? 'border-gold-accent/20' : ''
            }`}
          >
            <span className={`text-2xl font-black font-mono w-10 ${w.rank === 1 ? 'text-gold-accent text-glow-gold' : w.rank <= 3 ? 'text-emerald-accent' : 'text-brand-on-surface-variant'}`}>
              #{w.rank}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white">{w.name}</p>
              <p className="text-xs text-brand-on-surface-variant">{w.country} · {w.streak} day streak</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-black text-emerald-accent">{w.score}</p>
              <p className="text-[10px] text-gold-accent font-mono">Consistency {w.bonus}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
