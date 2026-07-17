'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Star, X } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import LeaderboardTable, { LeaderboardEntry } from '@/components/platform/LeaderboardTable';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = 'calendar' | 'payroll';

interface WorkerOption {
  id: string;
  display_name: string;
  country: string;
  worker_type: string;
}

interface QualityIndicator {
  id: string;
  name: string;
  scale_min: number;
  scale_max: number;
}

interface QualityRating {
  id: string;
  worker_id: string;
  score: number;
  reason_note: string | null;
  created_at: string;
}

const PERIOD_PILLS: { key: Period; label: string }[] = [
  { key: 'calendar', label: 'Calendar Month' },
  { key: 'payroll', label: 'Payroll Period' },
];

// ── Rate Worker modal ──────────────────────────────────────────────────────────

function RateWorkerModal({
  workers,
  onClose,
  onSaved,
}: {
  workers: WorkerOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [workerId, setWorkerId] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workerId || score == null) {
      setError('Select a worker and a score.');
      return;
    }
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const indicator = await api.get<QualityIndicator>('/quality/default-indicator');
      await api.post('/quality/ratings', {
        worker_id: workerId,
        indicator_id: indicator.id,
        score,
        reason_note: reason.trim(),
        session_id: null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rating');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white">Rate Worker</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-theme-muted">
            Rate each worker at the end of every payroll period; ratings are stored and averaged over the trailing 5 periods.
          </p>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Worker</label>
            <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="input-field" required>
              <option value="">Select a worker…</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>{w.display_name} ({w.country})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Score</label>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors border ${
                    score != null && n <= score
                      ? 'bg-gold-accent/20 border-gold-accent/50 text-gold-accent'
                      : 'bg-white/[0.03] border-white/10 text-theme-muted hover:text-gold-accent hover:border-gold-accent/30'
                  }`}
                  aria-label={`${n} out of 5`}
                >
                  <Star size={18} fill={score != null && n <= score ? 'currentColor' : 'none'} />
                </button>
              ))}
              <span className="ml-2 text-sm font-bold text-white tabular-nums">
                {score != null ? `${score} / 5` : '—'}
              </span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Reason (required)</label>
            <textarea
              rows={3}
              required
              placeholder="Why this score? e.g. task accuracy, communication, reliability this period…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" className="text-white" /> : <Star size={14} />}
              Save rating
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminQualityPage() {
  const [period, setPeriod] = useState<Period>('calendar');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [ratings, setRatings] = useState<QualityRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recalculating, setRecalculating] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState<string | null>(null);
  const [showRateModal, setShowRateModal] = useState(false);

  const loadLeaderboard = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await api.get<LeaderboardEntry[]>(`/leaderboard?period=${p}&limit=100`));
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

  useEffect(() => { loadLeaderboard(period); }, [loadLeaderboard, period]);

  useEffect(() => {
    api.get<WorkerOption[]>('/workers').then(setWorkers).catch(() => {});
    loadRatings();
  }, [loadRatings]);

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
      await loadLeaderboard(period);
    } catch (e) {
      setRecalcMessage(e instanceof Error ? e.message : 'Recalculation failed');
    } finally {
      setRecalculating(false);
    }
  }

  const periodLabel = entries[0]?.period_label;

  return (
    <div>
      <PageHeader
        title="Quality & Leaderboard"
        description="Composite quality scores, worker rankings, and admin ratings."
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
              onClick={() => setShowRateModal(true)}
              className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
            >
              <Star size={14} /> Rate Worker
            </button>
          </>
        }
      />

      {recalcMessage && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-xs mb-4">
          <CheckCircle size={14} /> {recalcMessage}
        </div>
      )}

      {/* Period toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 w-fit">
          {PERIOD_PILLS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                period === key ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {periodLabel && <span className="text-xs font-mono text-emerald-accent">{periodLabel}</span>}
      </div>

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
        Composite score: 30% assessments · 30% admin ratings · 25% reliability · 15% consistency
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
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Reason</th>
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
          workers={workers}
          onClose={() => setShowRateModal(false)}
          onSaved={loadRatings}
        />
      )}
    </div>
  );
}
