'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bell, CheckCircle, Eye, RefreshCw } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { QUALITY_TABS } from '@/components/platform/AdminSectionTabs';
import { LeaderboardEntry } from '@/components/platform/LeaderboardTable';
import PeriodFilter, { PeriodFilterOption } from '@/components/platform/PeriodFilter';
import PendingRatingsModal from '@/components/quality/PendingRatingsModal';
import WorkerQualityModal from '@/components/quality/WorkerQualityModal';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { enteredPayMinutes, formatLoggedHours } from '@/lib/hours';
import { pickCurrentPeriod } from '@/lib/periods';

interface Worker {
  id: string;
  display_name: string;
  country: string;
  worker_type: string;
}

interface Rating {
  id: string;
  worker_id: string;
  score: number;
  reason_note: string | null;
}

interface PendingRatings {
  payroll_period_id: string;
  period_label: string;
  pending: PendingWorker[];
  rated_count: number;
  total_workers: number;
}

interface PendingWorker {
  worker_id: string;
  display_name: string;
  country: string;
}

interface SessionHours {
  worker_id: string;
  start_time: string;
  image_start_at?: string | null;
  image_end_at?: string | null;
}

function pts(raw: number | null | undefined, weight: number): string {
  if (raw == null) return '—';
  return (Number(raw) * weight).toFixed(1);
}

const thClass =
  'px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted whitespace-nowrap';
const tdClass = 'px-3 py-3 text-sm tabular-nums whitespace-nowrap';

export default function AdminQualityPage() {
  const [periods, setPeriods] = useState<PeriodFilterOption[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [pending, setPending] = useState<PendingRatings | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionHours, setSessionHours] = useState<SessionHours[]>([]);

  const [periodsReady, setPeriodsReady] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const suffix = periodId ? `?payroll_period_id=${periodId}` : '';
    const leaderboardQuery = new URLSearchParams({
      period: periodId ? 'payroll' : 'all',
      limit: '100',
    });
    if (periodId) leaderboardQuery.set('payroll_period_id', periodId);
    try {
      const [board, periodRatings, periodPending, sessions] = await Promise.all([
        api.get<LeaderboardEntry[]>(`/leaderboard?${leaderboardQuery.toString()}`),
        api.get<Rating[]>(`/quality/ratings${suffix}`),
        api.get<PendingRatings>(`/quality/pending-ratings${suffix}`),
        api.get<SessionHours[]>('/sessions?limit=1000&include_images=false'),
      ]);
      setEntries(board);
      setRatings(periodRatings);
      setPending(periodPending);
      setSessionHours(sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quality data.');
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    api.get<PeriodFilterOption[]>('/payroll/periods').then((list) => {
      setPeriods(list);
      setPeriodId(pickCurrentPeriod(list)?.id || '');
      setPeriodsReady(true);
    }).catch(() => setPeriodsReady(true));
    api.get<Worker[]>('/workers').then(setWorkers).catch(() => {});
  }, []);
  useEffect(() => { if (periodsReady) void load(); }, [load, periodsReady]);

  const selectedPeriod = periods.find((period) => period.id === periodId);
  const viewingAll = !periodId;
  const activePeriodId = periodId || pending?.payroll_period_id || '';
  const activePeriodLabel = viewingAll
    ? 'All working months'
    : (selectedPeriod?.label ?? pending?.period_label ?? entries[0]?.period_label ?? 'Latest working month');
  const entriesByWorker = useMemo(() => new Map(entries.map((entry) => [entry.worker_id, entry])), [entries]);
  const ratingsByWorker = useMemo(() => new Map(ratings.map((rating) => [rating.worker_id, rating])), [ratings]);
  const hoursByWorker = useMemo(() => {
    const start = selectedPeriod?.start_date.slice(0, 10);
    const end = selectedPeriod?.end_date.slice(0, 10);
    const scoped = start && end
      ? sessionHours.filter((s) => {
          const d = s.start_time.slice(0, 10);
          return d >= start && d <= end;
        })
      : sessionHours;
    const map = new Map<string, number>();
    for (const s of scoped) {
      map.set(s.worker_id, (map.get(s.worker_id) ?? 0) + enteredPayMinutes(s));
    }
    return map;
  }, [sessionHours, selectedPeriod]);
  const selectedWorker = workers.find((worker) => worker.id === selectedWorkerId);

  async function recalculate() {
    setRecalculating(true);
    setMessage(null);
    try {
      await api.post(periodId ? `/quality/recalculate?payroll_period_id=${periodId}` : '/quality/recalculate', {});
      setMessage(`Quality scores recalculated for ${activePeriodLabel}.`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Recalculation failed.');
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Quality"
        actions={
          <>
            <button type="button" onClick={recalculate} disabled={recalculating} className="btn-secondary flex items-center gap-2 text-sm py-2 px-4 disabled:opacity-60">
              {recalculating ? <SpinningDots size="sm" /> : <RefreshCw size={14} />} Recalculate
            </button>
            <button type="button" onClick={() => setPendingOpen(true)} className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
              <Bell size={14} /> Pending
              {pending && pending.pending.length > 0 && (
                <span className="inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-gold-accent text-brand-on-primary text-[10px] font-black">
                  {pending.pending.length}
                </span>
              )}
            </button>
          </>
        }
      />
      <AdminSectionTabs tabs={QUALITY_TABS} />

      <PeriodFilter periods={periods} value={periodId} onChange={setPeriodId} allowAll allLabel="All working months" label="Working month" />

      {message && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-xs">
          <CheckCircle size={14} /> {message}
        </div>
      )}

      <section className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-theme-heading">Workers</h2>
            <p className="text-xs text-theme-muted mt-0.5">{activePeriodLabel}</p>
          </div>
          {pending && (
            <span className="text-xs text-theme-muted">{pending.rated_count}/{pending.total_workers} rated</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><SpinningDots size="lg" /></div>
        ) : error ? (
          <div className="flex items-center gap-2 p-5 text-danger text-sm"><AlertCircle size={16} /> {error}</div>
        ) : workers.length === 0 ? (
          <p className="p-5 text-sm text-theme-muted">No workers available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className={`${thClass} text-left pl-5 pr-4`}>Worker</th>
                  <th className={`${thClass} text-right`}>Hours</th>
                  <th className={`${thClass} text-right`}>Total</th>
                  <th className={`${thClass} text-right`}>Assessment /40</th>
                  <th className={`${thClass} text-right`}>Rating /20</th>
                  <th className={`${thClass} text-right`}>Reliability /15</th>
                  <th className={`${thClass} text-right`}>Consistency /25</th>
                  <th className={`${thClass} text-right`}>Admin 1–5</th>
                  <th className={`${thClass} text-center pr-5 w-14`} />
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => {
                  const entry = entriesByWorker.get(worker.id);
                  const rating = ratingsByWorker.get(worker.id);
                  return (
                    <tr key={worker.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                      <td className="pl-5 pr-4 py-3">
                        <p className="text-sm font-medium text-theme-heading truncate max-w-[16rem]">{worker.display_name}</p>
                        <p className="text-xs text-theme-muted truncate">{worker.country || 'Unassigned'}</p>
                      </td>
                      <td className={`${tdClass} text-right font-semibold text-theme-heading`}>
                        {(() => {
                          const mins = hoursByWorker.get(worker.id) ?? 0;
                          return mins > 0 ? formatLoggedHours(mins) : '—';
                        })()}
                      </td>
                      <td className={`${tdClass} text-right font-semibold text-emerald-accent`}>
                        {entry ? Number(entry.composite_score).toFixed(1) : '—'}
                      </td>
                      <td className={`${tdClass} text-right text-theme-heading`}>
                        {pts(entry?.assessment_component, 0.4)}
                      </td>
                      <td className={`${tdClass} text-right text-theme-heading`}>
                        {pts(entry?.rating_component, 0.2)}
                      </td>
                      <td className={`${tdClass} text-right text-theme-heading`}>
                        {pts(entry?.reliability_component, 0.15)}
                      </td>
                      <td className={`${tdClass} text-right text-theme-heading`}>
                        {pts(entry?.consistency_component, 0.25)}
                      </td>
                      <td className={`${tdClass} text-right font-bold ${!viewingAll && rating ? 'text-gold-accent' : 'text-theme-muted'}`}>
                        {viewingAll ? '—' : (rating ? `${Number(rating.score)}/5` : '—')}
                      </td>
                      <td className="pr-5 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedWorkerId(worker.id)}
                          aria-label={`Edit rating for ${worker.display_name}`}
                          className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-white/10 text-theme-muted hover:text-emerald-accent hover:border-emerald-accent/40"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-theme-muted mt-3">
        Composite = assessment/40 + rating/20 + reliability/15 + consistency/25. One current score per test (retake overwrites). Period view averages tests in that month; All working months averages every current test. Rating 1–5 is per month. Recalculate after score changes.
      </p>

      {pendingOpen && pending && (
        <PendingRatingsModal
          periodLabel={pending.period_label}
          pending={pending.pending}
          ratedCount={pending.rated_count}
          totalWorkers={pending.total_workers}
          onClose={() => setPendingOpen(false)}
          onSelectWorker={(workerId) => {
            setPendingOpen(false);
            setSelectedWorkerId(workerId);
          }}
        />
      )}

      {selectedWorker && activePeriodId && (
        <WorkerQualityModal
          worker={selectedWorker}
          rating={ratingsByWorker.get(selectedWorker.id)}
          periodId={activePeriodId}
          periodLabel={activePeriodLabel}
          onClose={() => setSelectedWorkerId(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
