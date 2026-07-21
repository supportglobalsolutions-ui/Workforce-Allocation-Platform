'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Trophy } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import LeaderboardTable, { LeaderboardEntry } from '@/components/platform/LeaderboardTable';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

interface MyScore {
  composite_score: number;
  global_rank: number | null;
  country_rank: number | null;
  period_label: string | null;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myScore, setMyScore] = useState<MyScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, mine] = await Promise.all([
        api.get<LeaderboardEntry[]>('/leaderboard?period=payroll&limit=100'),
        api.get<MyScore | null>('/quality/me'),
      ]);
      setEntries(rows);
      setMyScore(mine);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const workingMonthLabel = entries[0]?.period_label ?? myScore?.period_label ?? null;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Leaderboard"
        description="Worker rankings by working month."
      />

      {workingMonthLabel && (
        <p className="text-xs text-theme-muted">
          Working month{' '}
          <span className="font-semibold text-emerald-accent">{workingMonthLabel}</span>
        </p>
      )}

      {/* My rank card */}
      {myScore && (
        <div className="glass-panel rounded-2xl border border-gold-accent/20 p-5 flex flex-wrap items-center gap-5">
          <span className="w-12 h-12 rounded-xl bg-gold-accent/10 text-gold-accent flex items-center justify-center shrink-0">
            <Trophy size={22} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-theme-muted">My Rank</p>
            <p className="text-2xl font-black text-theme-heading tracking-tight mt-0.5">
              {myScore.global_rank != null ? `#${myScore.global_rank}` : '—'}
            </p>
          </div>
          <div className="border-l border-white/[0.08] pl-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-theme-muted">Composite Score</p>
            <p className="text-2xl font-black text-emerald-accent tracking-tight mt-0.5 tabular-nums">
              {Number(myScore.composite_score).toFixed(1)}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-12 text-center">
          <p className="text-sm text-theme-muted">No scores yet — ask an admin to recalculate the leaderboard.</p>
        </div>
      ) : (
        <LeaderboardTable entries={entries} />
      )}

      <p className="text-xs text-theme-muted">
        Composite score: 30% assessments · 30% admin ratings · 25% reliability · 15% consistency
      </p>
    </div>
  );
}
