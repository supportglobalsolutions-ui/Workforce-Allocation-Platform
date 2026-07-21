'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Star } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { QUALITY_TABS } from '@/components/platform/AdminSectionTabs';
import LeaderboardTable, { LeaderboardEntry } from '@/components/platform/LeaderboardTable';
import RateWorkerModal from '@/components/quality/RateWorkerModal';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkerOption {
  id: string;
  display_name: string;
  country: string;
  worker_type: string;
}

interface QualityRating {
  id: string;
  worker_id: string;
  score: number;
  reason_note: string | null;
  payroll_period_id: string | null;
  created_at: string;
}

interface PendingRatings {
  payroll_period_id: string;
  period_label: string;
  pending: { worker_id: string; display_name: string; country: string; worker_type: string }[];
  rated_count: number;
  total_workers: number;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminQualityPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [ratings, setRatings] = useState<QualityRating[]>([]);
  const [pending, setPending] = useState<PendingRatings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recalculating, setRecalculating] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState<string | null>(null);
  const [showRateModal, setShowRateModal] = useState(false);
  const [rateWorkerId, setRateWorkerId] = useState('');

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Leaderboard is always scoped to the working month (payroll period).
      setEntries(await api.get<LeaderboardEntry[]>('/leaderboard?period=payroll&limit=100'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRatings = useCallback(async () => {
    try {
      setRatings(await api.get<QualityRating[]>('/quality/ratings'));
    } catch {
      // Recent-ratings panel is secondary; leave empty on failure.
    }
  }, []);

  const loadPending = useCallback(async () => {
    try {
      setPending(await api.get<PendingRatings>('/quality/pending-ratings'));
    } catch {
      setPending(null);
    }
  }, []);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  useEffect(() => {
    api.get<WorkerOption[]>('/workers').then(setWorkers).catch(() => {});
    loadRatings();
    loadPending();
  }, [loadRatings, loadPending]);

  const workerNames = useMemo(() => {
    const map = new Map<string, string>();
    workers.forEach((w) => map.set(w.id, w.display_name));
    return map;
  }, [workers]);

  const recentRatings = useMemo(
    () => [...ratings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 25),
    [ratings],
  );

  async function handleRecalculate() {
    setRecalculating(true);
    setRecalcMessage(null);
    try {
      await api.post('/quality/recalculate', {});
      setRecalcMessage('Leaderboard recalculated.');
      await loadLeaderboard();
    } catch (e) {
      setRecalcMessage(e instanceof Error ? e.message : 'Recalculation failed');
    } finally {
      setRecalculating(false);
    }
  }

  function openRate(workerId = '') {
    setRateWorkerId(workerId);
    setShowRateModal(true);
  }

  function handleRated() {
    loadRatings();
    loadPending();
  }

  // Prefer the working-month label from pending ratings; fall back to leaderboard rows.
  const workingMonthLabel = pending?.period_label ?? entries[0]?.period_label ?? null;

  return (
    <div>
      <PageHeader
        title="Quality & Leaderboard"
        description="Composite quality scores and admin ratings by working month."
        actions={
          <>
            <button
              type="button"
              onClick={handleRecalculate}
              disabled={recalculating}
              className="btn-secondary flex items-center gap-2 text-sm py-2 px-4 disabled:opacity-60"
            >
              {recalculating ? <SpinningDots size="sm" className="text-emerald-accent" /> : <RefreshCw size={14} />}
              Recalculate
            </button>
            <button
              type="button"
              onClick={() => openRate()}
              className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
            >
              <Star size={14} /> Rate Worker
            </button>
          </>
        }
      />
      <AdminSectionTabs tabs={QUALITY_TABS} />

      {recalcMessage && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-xs mb-4">
          <CheckCircle size={14} /> {recalcMessage}
        </div>
      )}

      {workingMonthLabel && (
        <p className="text-xs text-theme-muted mb-4">
          Working month{' '}
          <span className="font-semibold text-emerald-accent">{workingMonthLabel}</span>
        </p>
      )}

      {/* Pending ratings for current working month */}
      {pending && pending.pending.length > 0 && (
        <section aria-label="Pending ratings" className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gold-accent">
                Pending Ratings
              </h2>
              <p className="text-[11px] text-theme-muted mt-0.5">
                {pending.rated_count} of {pending.total_workers} active workers rated for {pending.period_label}
              </p>
            </div>
          </div>
          <div className="glass-panel rounded-2xl border border-gold-accent/20 overflow-hidden">
            <ul className="divide-y divide-white/[0.05] max-h-56 overflow-y-auto">
              {pending.pending.map((w) => (
                <li key={w.worker_id} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/[0.02]">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{w.display_name}</p>
                    <p className="text-[11px] text-theme-muted truncate">{w.country || '—'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openRate(w.worker_id)}
                    className="shrink-0 btn-secondary text-[11px] py-1.5 px-2.5 flex items-center gap-1.5"
                  >
                    <Star size={11} /> Rate
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {pending && pending.pending.length === 0 && pending.total_workers > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-xs mb-6">
          <CheckCircle size={14} />
          All {pending.total_workers} active workers rated for {pending.period_label}.
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
          <p className="text-sm text-theme-muted">No scores yet — use Recalculate to compute the leaderboard.</p>
        </div>
      ) : (
        <LeaderboardTable entries={entries} />
      )}

      <p className="text-xs text-theme-muted mt-3">
        Composite score: 30% assessments · 30% admin ratings (1–5) · 25% reliability · 15% consistency
      </p>

      {/* Recent ratings */}
      <section aria-label="Recent ratings" className="mt-8">
        <h2 className="text-xs font-bold uppercase tracking-widest text-theme-muted mb-3">Recent Ratings</h2>
        {recentRatings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center">
            <p className="text-sm text-theme-muted">No ratings recorded yet.</p>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Worker</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted w-28">Score</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Comment</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted w-28">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentRatings.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white font-medium">
                      {workerNames.get(r.worker_id) ?? `${r.worker_id.slice(0, 8)}…`}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-gold-accent font-bold tabular-nums">
                        <Star size={12} fill="currentColor" /> {Number(r.score)} / 5
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-theme-muted">{r.reason_note ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-xs text-theme-muted">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showRateModal && (
        <RateWorkerModal
          key={rateWorkerId || 'new'}
          workers={workers}
          lockedWorkerId={rateWorkerId || undefined}
          initialWorkerId={rateWorkerId || undefined}
          onClose={() => setShowRateModal(false)}
          onSaved={handleRated}
        />
      )}
    </div>
  );
}
