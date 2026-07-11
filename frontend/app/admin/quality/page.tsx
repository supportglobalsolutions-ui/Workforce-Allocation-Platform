'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Eye, Trophy, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

interface Worker {
  id: string;
  display_name: string;
  country: string;
  worker_type: string;
  pay_tier: string;
  status: string;
  email: string | null;
}

interface WorkSession {
  id: string;
  worker_id: string;
  duration_minutes: number | null;
  close_status: string | null;
  end_time: string | null;
}

interface QualityRating {
  id: string;
  worker_id: string;
  score: number;
}

interface RankedWorker {
  rank: number;
  worker: Worker;
  totalSessions: number;
  completedSessions: number;
  totalHours: number;
  avgQuality: number | null;
  score: number;
}

const TYPE_LABELS: Record<string, string> = {
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

function RankCell({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm font-bold text-gold-accent">1st</span>;
  if (rank === 2) return <span className="text-sm font-bold text-gray-300">2nd</span>;
  if (rank === 3) return <span className="text-sm font-bold text-orange-400">3rd</span>;
  return <span className="text-sm font-bold text-theme-muted">#{rank}</span>;
}

// ── Worker metrics detail panel ────────────────────────────────────────────────

function WorkerMetricsPanel({ entry, onClose }: { entry: RankedWorker; onClose: () => void }) {
  const metrics = [
    { label: 'Total Sessions',     value: entry.totalSessions },
    { label: 'Completed Sessions', value: entry.completedSessions },
    { label: 'Total Hours',        value: `${entry.totalHours.toFixed(1)}h` },
    { label: 'Avg Quality Score',  value: entry.avgQuality !== null ? `${entry.avgQuality.toFixed(2)} / 5` : '—' },
    { label: 'Composite Score',    value: entry.score.toFixed(1) },
  ];

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <div className="flex items-center gap-2">
              <RankCell rank={entry.rank} />
              <p className="text-sm font-bold text-white">{entry.worker.display_name}</p>
            </div>
            <p className="text-xs text-theme-muted mt-0.5">{entry.worker.country} · {TYPE_LABELS[entry.worker.worker_type] ?? entry.worker.worker_type}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Metrics */}
        <div className="p-5 space-y-3">
          {metrics.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
              <span className="text-xs text-theme-muted">{label}</span>
              <span className="text-sm font-bold text-white tabular-nums">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [workers, setWorkers]   = useState<Worker[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [ratings, setRatings]   = useState<QualityRating[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<RankedWorker | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Worker[]>('/workers'),
      api.get<WorkSession[]>('/sessions?limit=1000&include_images=false'),
      api.get<QualityRating[]>('/quality/ratings'),
    ])
      .then(([w, s, r]) => { setWorkers(w); setSessions(s); setRatings(r); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load leaderboard'))
      .finally(() => setLoading(false));
  }, []);

  const ranked = useMemo<RankedWorker[]>(() => {
    return workers
      .map((worker) => {
        const ws = sessions.filter((s) => s.worker_id === worker.id);
        const completedSessions = ws.filter((s) => s.close_status === 'completed' || (s.end_time && !s.close_status)).length;
        const totalHours = ws.reduce((acc, s) => acc + (s.duration_minutes ?? 0), 0) / 60;
        const workerRatings = ratings.filter((r) => r.worker_id === worker.id);
        const avgQuality = workerRatings.length
          ? workerRatings.reduce((acc, r) => acc + Number(r.score), 0) / workerRatings.length
          : null;
        const score =
          Math.min(completedSessions * 2, 40) +
          Math.min(totalHours * 0.5, 40) +
          (avgQuality !== null ? (avgQuality / 5) * 20 : 0);
        return { rank: 0, worker, totalSessions: ws.length, completedSessions, totalHours, avgQuality, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }, [workers, sessions, ratings]);

  return (
    <div>
      <PageHeader title="Leaderboard" description="Ranked by sessions, hours worked, and quality score." />

      {loading ? (
        <div className="flex justify-center py-20"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted w-16">Rank</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Worker</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Sessions</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden sm:table-cell">Hours</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">Quality</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Score</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {ranked.map((entry) => (
                <tr
                  key={entry.worker.id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3"><RankCell rank={entry.rank} /></td>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{entry.worker.display_name}</p>
                    <p className="text-xs text-theme-muted">{entry.worker.country}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-white tabular-nums">{entry.completedSessions}</td>
                  <td className="px-4 py-3 text-right text-white tabular-nums hidden sm:table-cell">{entry.totalHours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right text-white tabular-nums hidden md:table-cell">
                    {entry.avgQuality !== null ? entry.avgQuality.toFixed(2) : <span className="text-theme-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-accent tabular-nums">{entry.score.toFixed(0)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(entry)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                      style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}
                      title="View metrics"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-theme-muted text-sm">No workers to rank yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && <WorkerMetricsPanel entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
