'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import {
  ExternalLink,
  X,
} from 'lucide-react';
import Link from 'next/link';

import AnalyticsViewToggle, { type AnalyticsView } from '@/components/platform/AnalyticsViewToggle';
import DataAlert from '@/components/platform/DataAlert';
import PageHeader from '@/components/platform/PageHeader';
import PeriodFilter from '@/components/platform/PeriodFilter';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import {
  gatherBriefing,
  gatherInspection,
  type BriefingMove,
  type BriefingSeverity,
  type IntelligenceBriefing,
  type IntelligenceInspection,
} from '@/lib/intelligence/briefing';
import { pickCurrentPeriod } from '@/lib/periods';
import { plainText } from '@/lib/intelligence/plain';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
);

interface PayrollPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  currency: string;
  status: string;
}

type ModalKind = 'work' | 'rdp' | 'payouts' | 'fleet' | 'quality' | 'blind' | null;

const REFRESH_MS = 15 * 60 * 1000;

const EMERALD = '#3FC7A0';
const GOLD = '#D4AF37';
const BLUE = '#60A5FA';
const DANGER = '#F87171';
const TICK = 'rgba(148, 163, 184, 0.9)';
const GRID = 'rgba(148, 163, 184, 0.12)';

function aggregateBriefings(
  rows: IntelligenceBriefing[],
  periods: PayrollPeriod[],
): IntelligenceBriefing {
  const currentId = pickCurrentPeriod(periods)?.id;
  const primary = rows.find((row) => row.period.id === currentId) ?? rows[0];
  const ordered = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const currencies = Array.from(new Set(rows.map((row) => row.period.currency)));
  const currency = currencies.length === 1 ? currencies[0] : 'Mixed';
  const sum = (key: keyof IntelligenceBriefing['scorecard']) =>
    rows.reduce((total, row) => total + Number(row.scorecard[key] ?? 0), 0);
  const qualityCount = sum('quality_count');
  const qualityAvg = qualityCount > 0
    ? rows.reduce(
      (total, row) => total + Number(row.scorecard.quality_avg ?? 0) * row.scorecard.quality_count,
      0,
    ) / qualityCount
    : null;
  const scorecard = {
    ...primary.scorecard,
    work_hours: sum('work_hours'),
    rdp_hours: sum('rdp_hours'),
    worker_earnings: sum('worker_earnings'),
    worker_payouts: sum('worker_payouts'),
    quality_avg: qualityAvg,
    quality_count: qualityCount,
    workers_with_hours_no_payslip: sum('workers_with_hours_no_payslip'),
    payslip_count: sum('payslip_count'),
    session_count: sum('session_count'),
  };

  const payByWorker = new Map<string, { name: string; worker_id?: string; hours: number; earned: number; paid: number }>();
  for (const row of rows) {
    for (const point of row.charts.pay_vs_hours) {
      const key = point.worker_id ?? point.name;
      const current = payByWorker.get(key) ?? {
        name: point.name,
        worker_id: point.worker_id,
        hours: 0,
        earned: 0,
        paid: 0,
      };
      current.hours += point.hours;
      current.earned += point.earned;
      current.paid += point.paid;
      payByWorker.set(key, current);
    }
  }

  const qualityByBucket = new Map<string, number>();
  for (const row of rows) {
    for (const bucket of row.charts.quality_buckets) {
      qualityByBucket.set(bucket.label, (qualityByBucket.get(bucket.label) ?? 0) + bucket.count);
    }
  }

  const from = ordered[0]?.start_date ?? primary.period.start_date;
  const to = ordered[ordered.length - 1]?.end_date ?? primary.period.end_date;
  return {
    ...primary,
    period: {
      id: '',
      label: 'All working months',
      start_date: from,
      end_date: to,
      currency,
      status: 'all',
    },
    month: {
      label: 'All working months',
      from,
      to,
      status: 'all',
      currency,
      work_hours: scorecard.work_hours,
      rdp_hours: scorecard.rdp_hours,
      session_count: scorecard.session_count,
      payslip_count: scorecard.payslip_count,
      worker_earnings: scorecard.worker_earnings,
      worker_payouts: scorecard.worker_payouts,
      quality_avg: scorecard.quality_avg,
      quality_count: scorecard.quality_count,
      parked_rdps: scorecard.parked_rdps,
      idle_rdps: scorecard.idle_rdps,
      producing_rdps: scorecard.producing_rdps,
      rdp_count: scorecard.rdp_count,
      workers_with_hours_no_payslip: scorecard.workers_with_hours_no_payslip,
    },
    scorecard,
    charts: {
      daily_hours: primary.charts.daily_hours,
      pay_vs_hours: Array.from(payByWorker.values())
        .sort((a, b) => b.paid - a.paid || b.hours - a.hours),
      quality_buckets: Array.from(qualityByBucket, ([label, count]) => ({ label, count })),
      fleet: primary.charts.fleet,
    },
    warnings: Array.from(new Set(rows.flatMap((row) => row.warnings))),
  };
}

const chartOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { color: TICK, boxWidth: 10, usePointStyle: true } },
  },
  scales: {
    x: { grid: { color: GRID }, ticks: { color: TICK } },
    y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK } },
  },
};

const lineOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { color: TICK, boxWidth: 10, usePointStyle: true } },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: TICK, maxRotation: 0 } },
    y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK } },
  },
};

const TONE_LABEL: Record<BriefingSeverity, string> = {
  critical: 'Act now',
  watch: 'Look into',
  clear: 'OK',
};

const TONE_BADGE: Record<BriefingSeverity, string> = {
  critical: 'bg-danger/15 text-danger',
  watch: 'bg-gold-accent/15 text-gold-accent',
  clear: 'bg-emerald-accent/15 text-emerald-accent',
};

const DOMAIN_LABEL: Record<string, string> = {
  pay: 'Pay',
  time: 'Time',
  fleet: 'Machines',
  quality: 'Quality',
};

function fmtMoney(x: number, currency = 'USD') {
  return `${currency} ${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtHours(x: number) {
  return `${x.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 0 })}h`;
}

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function chipDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function chipWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl glass-panel max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-theme px-5 py-4">
          <h2 className="text-base font-black text-theme-heading">{title}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading">
            <X size={14} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ClockPanel({
  title,
  subtitle,
  rows,
  onClick,
}: {
  title: string;
  subtitle: string;
  rows: { label: string; value: string }[];
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-sm font-semibold text-theme-heading">{title}</p>
      <p className="text-xs text-theme-muted mt-0.5 mb-4">{subtitle}</p>
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-theme-muted">{row.label}</dt>
            <dd className="text-sm font-semibold text-theme-heading tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
  const cls = 'glass-panel p-5 h-full w-full text-left';
  if (onClick) {
    return (
      <button type="button" className={`${cls} focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-accent/50`} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

function NeedCard({ move, currency }: { move: BriefingMove; currency: string }) {
  const primary = move.steps[0];
  const headline = plainText(move.headline);
  const why = plainText(move.why);
  const actionLabel = primary ? plainText(primary.label) : '';

  return (
    <article className="rounded-2xl border border-theme px-4 sm:px-5 py-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_BADGE[move.severity]}`}>
          {TONE_LABEL[move.severity]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-theme-muted mb-1">{DOMAIN_LABEL[move.domain] ?? move.domain}</p>
          <h3 className="text-base font-semibold text-theme-heading leading-snug">{headline}</h3>
          <p className="text-sm text-theme-muted mt-1.5 leading-relaxed">{why}</p>
          {move.entities.length > 0 ? (
            <p className="text-xs text-theme-muted mt-2">
              Involved: {move.entities.map((e) => e.name).join(', ')}
            </p>
          ) : null}
          {move.hours_at_risk > 0 || move.amount_at_risk > 0 ? (
            <p className="text-xs text-theme-heading mt-2 tabular-nums">
              {move.hours_at_risk > 0 ? `${fmtHours(move.hours_at_risk)} at risk` : null}
              {move.hours_at_risk > 0 && move.amount_at_risk > 0 ? ' · ' : null}
              {move.amount_at_risk > 0 ? fmtMoney(move.amount_at_risk, currency) : null}
            </p>
          ) : null}
          {primary ? (
            <div className="mt-4 rounded-xl border border-emerald-accent/25 bg-emerald-accent/5 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-accent mb-1">Suggested action</p>
              {primary.href ? (
                <Link href={primary.href} className="text-sm font-medium text-theme-heading hover:text-emerald-accent inline-flex items-center gap-1">
                  {actionLabel}
                  <ExternalLink size={12} />
                </Link>
              ) : (
                <p className="text-sm font-medium text-theme-heading">{actionLabel}</p>
              )}
            </div>
          ) : null}
          {move.steps.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {move.steps.slice(1).map((step, i) => (
                step.href ? (
                  <Link key={`${step.label}-${i}`} href={step.href} className="text-xs text-theme-muted hover:text-emerald-accent inline-flex items-center gap-1">
                    {plainText(step.label)}
                    <ExternalLink size={10} />
                  </Link>
                ) : (
                  <span key={`${step.label}-${i}`} className="text-xs text-theme-muted">{plainText(step.label)}</span>
                )
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function OrganizationAnalyticsPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<IntelligenceBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<IntelligenceInspection | null>(null);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [view, setView] = useState<AnalyticsView>('cards');
  const [modal, setModal] = useState<ModalKind>(null);

  useEffect(() => {
    api.get<PayrollPeriod[]>('/payroll/periods')
      .then((list) => {
        setPeriods(list);
        if (list.length) setPeriodId(pickCurrentPeriod(list)?.id ?? list[0].id);
      })
      .catch((e) => setPeriodsError(e instanceof Error ? e.message : 'Failed to load working months.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (periods.length === 0) return;
    let cancelled = false;

    const load = async (silent: boolean) => {
      if (!silent) {
        setBriefingLoading(true);
        setInspectionLoading(true);
        setBriefingError(null);
      }
      const scopeIds = periodId ? [periodId] : periods.map((period) => period.id);
      try {
        const results = await Promise.allSettled(scopeIds.map((id) => gatherBriefing(id)));
        if (cancelled) return;
        const loaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
        if (loaded.length === 0) throw new Error('Failed to load briefing.');
        const combined = periodId ? loaded[0] : aggregateBriefings(loaded, periods);
        const failed = results.length - loaded.length;
        setBriefing(failed > 0
          ? { ...combined, warnings: [...combined.warnings, `${failed} working month${failed === 1 ? '' : 's'} did not load.`] }
          : combined);
      } catch (e) {
        if (!cancelled && !silent) setBriefingError(e instanceof Error ? e.message : 'Failed to load briefing.');
      } finally {
        if (!cancelled && !silent) setBriefingLoading(false);
      }

      const inspectionPeriodId = periodId || pickCurrentPeriod(periods)?.id || periods[0]?.id;
      if (!inspectionPeriodId) {
        if (!cancelled) setInspectionLoading(false);
        return;
      }
      try {
        const row = await gatherInspection(inspectionPeriodId);
        if (!cancelled) setInspection(row);
      } catch {
        if (!cancelled) setInspection({ ok: false, messages: [], error: 'Inspection notes did not load.' });
      } finally {
        if (!cancelled) setInspectionLoading(false);
      }
    };

    load(false);
    const timer = window.setInterval(() => load(true), REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') load(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [periodId, periods]);

  if (loading) {
    return <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>;
  }
  if (periodsError) return <DataAlert tone="error">{periodsError}</DataAlert>;
  if (periods.length === 0) {
    return <DataAlert>No working months yet. Create one on Finance before Analytics can brief you.</DataAlert>;
  }

  const currency = briefing?.period.currency ?? periods.find((p) => p.id === periodId)?.currency ?? 'USD';
  const scopeLabel = periodId ? 'this month' : 'all working months';
  const sc = briefing?.scorecard;
  const charts = briefing?.charts;

  const dailyLine: ChartData<'line'> = {
    labels: (charts?.daily_hours ?? []).map((d) => dayLabel(d.day)),
    datasets: [
      {
        label: 'Work hours',
        data: (charts?.daily_hours ?? []).map((d) => d.work_hours),
        borderColor: EMERALD,
        backgroundColor: 'rgba(63, 199, 160, 0.12)',
        fill: true,
        tension: 0.35,
      },
      {
        label: 'RDP hours',
        data: (charts?.daily_hours ?? []).map((d) => d.rdp_hours),
        borderColor: GOLD,
        backgroundColor: 'rgba(212, 175, 55, 0.08)',
        fill: true,
        tension: 0.35,
      },
    ],
  };

  const payBar: ChartData<'bar'> = {
    labels: (charts?.pay_vs_hours ?? []).map((r) => r.name),
    datasets: [
      {
        label: 'Hours',
        data: (charts?.pay_vs_hours ?? []).map((r) => r.hours),
        backgroundColor: BLUE,
        borderRadius: 6,
        borderSkipped: false,
      },
      {
        label: 'Paid',
        data: (charts?.pay_vs_hours ?? []).map((r) => r.paid),
        backgroundColor: EMERALD,
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const qualityBar: ChartData<'bar'> = {
    labels: (charts?.quality_buckets ?? []).map((b) => b.label),
    datasets: [{
      label: 'Workers',
      data: (charts?.quality_buckets ?? []).map((b) => b.count),
      backgroundColor: [DANGER, GOLD, BLUE, EMERALD],
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  const fleetBar: ChartData<'bar'> = {
    labels: (charts?.fleet ?? []).map((f) => f.label),
    datasets: [{
      label: 'Machines',
      data: (charts?.fleet ?? []).map((f) => f.count),
      backgroundColor: [EMERALD, GOLD, DANGER],
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="What happened today, this week, and this month."
        actions={
          <>
            <PeriodFilter
              periods={periods}
              value={periodId}
              onChange={setPeriodId}
              allowAll
              allLabel="All working months"
              variant="inline"
              label="Working month"
            />
            <AnalyticsViewToggle value={view} onChange={setView} />
          </>
        }
      />

      {briefingError ? (
        <div className="mb-4">
          <DataAlert tone="error">{briefingError}</DataAlert>
        </div>
      ) : null}

      {briefing?.warnings.length ? (
        <div className="mb-4">
          <DataAlert tone="warning">
            Some data did not load. The rest of the page still works.
          </DataAlert>
        </div>
      ) : null}

      {briefingLoading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : !briefing ? (
        briefingError ? null : (
          <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
        )
      ) : (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <ClockPanel
              title="Today"
              subtitle={briefing.today ? chipDate(briefing.today.from) : '—'}
              onClick={() => setModal('work')}
              rows={[
                { label: 'Work hours', value: fmtHours(sc?.today_work_hours ?? 0) },
                { label: 'Machine hours', value: fmtHours(sc?.today_rdp_hours ?? 0) },
                { label: 'Sessions', value: String(sc?.today_session_count ?? 0) },
              ]}
            />
            <ClockPanel
              title="Last 7 days"
              subtitle={briefing.week ? `${chipDate(briefing.week.from)} – ${chipDate(briefing.week.to)}` : '—'}
              onClick={() => setModal('rdp')}
              rows={[
                { label: 'Work hours', value: fmtHours(sc?.week_work_hours ?? 0) },
                { label: 'Machine hours', value: fmtHours(sc?.week_rdp_hours ?? 0) },
                { label: 'Sessions', value: String(sc?.week_session_count ?? 0) },
              ]}
            />
            <ClockPanel
              title={briefing.month?.label ?? 'This month'}
              subtitle={briefing.month ? `${chipDate(briefing.month.from)} – ${chipDate(briefing.month.to)}` : '—'}
              onClick={() => setModal('payouts')}
              rows={[
                { label: 'Work hours', value: fmtHours(sc?.work_hours ?? 0) },
                { label: 'Paid', value: fmtMoney(sc?.worker_payouts ?? 0, currency) },
                { label: 'Quality', value: sc?.quality_avg != null ? sc.quality_avg.toFixed(1) : '—' },
                { label: 'Unused machines', value: String(sc?.parked_rdps ?? 0) },
              ]}
            />
          </section>

          <section className="mb-8">
            <h2 className="text-base font-semibold text-theme-heading mb-1">What needs your attention</h2>
            <p className="text-sm text-theme-muted mb-3">Each item tells you the problem and what to do next.</p>
            {briefing.moves.length === 0 ? (
              <DataAlert>Nothing urgent this week.</DataAlert>
            ) : (
              <div className="grid gap-3">
                {briefing.moves.map((move) => (
                  <NeedCard key={move.id} move={move} currency={currency} />
                ))}
              </div>
            )}
          </section>

          {inspectionLoading ? (
            <section className="mb-8">
              <h2 className="text-base font-semibold text-theme-heading mb-3">AI suggestions</h2>
              <div className="rounded-2xl border border-theme px-5 py-4 flex items-center gap-3 text-sm text-theme-muted">
                <SpinningDots size="sm" className="text-emerald-accent" />
                Writing simple suggestions…
              </div>
            </section>
          ) : inspection?.ok && inspection.messages.length > 0 ? (
            <section className="mb-8">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 className="text-base font-semibold text-theme-heading">AI suggestions</h2>
                {inspection.as_of ? (
                  <span className="text-xs text-theme-muted">{chipWhen(inspection.as_of)}</span>
                ) : null}
              </div>
              <p className="text-sm text-theme-muted mb-3">Short insights from the same numbers — not new facts.</p>
              <div className="rounded-2xl border border-theme divide-y divide-white/10">
                {inspection.messages.map((note, i) => (
                  <div key={`${note.title}-${i}`} className="px-4 sm:px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_BADGE[note.tone] ?? TONE_BADGE.watch}`}>
                        {TONE_LABEL[note.tone] ?? note.tone}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-theme-heading">{plainText(note.title)}</h3>
                        <p className="text-sm text-theme-muted mt-1 leading-relaxed">{plainText(note.body)}</p>
                        {note.action ? (
                          <div className="mt-3 rounded-xl border border-emerald-accent/25 bg-emerald-accent/5 px-3 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-accent mb-1">Suggested action</p>
                            <p className="text-sm font-medium text-theme-heading">{plainText(note.action)}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : inspection && !inspection.ok && inspection.error ? (
            <div className="mb-8">
              <DataAlert tone="warning">AI suggestions did not load. Problems above still use your data.</DataAlert>
            </div>
          ) : null}

          {view === 'cards' ? (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <div className="glass-panel p-5">
                <h2 className="text-sm font-semibold text-theme-heading mb-3">Hours · last 7 days</h2>
                {(charts?.daily_hours.length ?? 0) === 0 ? (
                  <DataAlert>No hours this week.</DataAlert>
                ) : (
                  <div className="h-[200px]"><Line data={dailyLine} options={lineOptions} /></div>
                )}
              </div>
              <div className="glass-panel p-5">
                <h2 className="text-sm font-semibold text-theme-heading mb-3">Machines this week</h2>
                <div className="h-[200px]"><Bar data={fleetBar} options={chartOptions} /></div>
              </div>
            </section>
          ) : (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <div className="glass-panel p-5">
                <h2 className="text-sm font-semibold text-theme-heading mb-3">Hours · last 7 days</h2>
                {(charts?.daily_hours.length ?? 0) === 0 ? (
                  <DataAlert>No hours this week.</DataAlert>
                ) : (
                  <div className="h-[220px]"><Line data={dailyLine} options={lineOptions} /></div>
                )}
              </div>
              <div className="glass-panel p-5">
                <h2 className="text-sm font-semibold text-theme-heading mb-3">Hours vs pay · {scopeLabel}</h2>
                {(charts?.pay_vs_hours.length ?? 0) === 0 ? (
                  <DataAlert>No payslips yet. Run Calculate on Finance.</DataAlert>
                ) : (
                  <div className="h-[220px]"><Bar data={payBar} options={chartOptions} /></div>
                )}
              </div>
              <div className="glass-panel p-5">
                <h2 className="text-sm font-semibold text-theme-heading mb-3">Quality · {scopeLabel}</h2>
                {(charts?.quality_buckets.every((b) => b.count === 0) ?? true) ? (
                  <DataAlert>No quality scores this month.</DataAlert>
                ) : (
                  <div className="h-[220px]"><Bar data={qualityBar} options={chartOptions} /></div>
                )}
              </div>
              <div className="glass-panel p-5">
                <h2 className="text-sm font-semibold text-theme-heading mb-3">Machines this week</h2>
                <div className="h-[220px]"><Bar data={fleetBar} options={chartOptions} /></div>
              </div>
            </section>
          )}

          {briefing.holding.length > 0 ? (
            <details className="mb-8 rounded-2xl border border-theme px-5 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-theme-heading list-none flex items-center justify-between">
                What’s fine
                <span className="text-xs font-normal text-theme-muted">{briefing.holding.length}</span>
              </summary>
              <ul className="mt-3 space-y-2 pb-2">
                {briefing.holding.map((a) => (
                  <li key={a.id} className="text-sm text-theme-muted">
                    {a.headline}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}

      {modal === 'work' && briefing && (
        <Modal title={`Work hours · ${briefing.period.label}`} onClose={() => setModal(null)}>
          <p className="text-sm text-theme-muted mb-4">Time from screenshots. Chart is the last 7 days.</p>
          <p className="text-2xl font-semibold text-theme-heading mb-4">{fmtHours(sc?.work_hours ?? 0)} {scopeLabel} · {fmtHours(sc?.week_work_hours ?? 0)} this week</p>
          <div className="h-[220px]"><Line data={dailyLine} options={lineOptions} /></div>
        </Modal>
      )}
      {modal === 'rdp' && briefing && (
        <Modal title={`Machine hours · ${briefing.period.label}`} onClose={() => setModal(null)}>
          <p className="text-sm text-theme-muted mb-4">Time the machine was connected. This is not pay.</p>
          <p className="text-2xl font-semibold text-theme-heading mb-4">{fmtHours(sc?.rdp_hours ?? 0)} {scopeLabel} · {fmtHours(sc?.week_rdp_hours ?? 0)} this week</p>
          <div className="h-[220px]"><Line data={dailyLine} options={lineOptions} /></div>
        </Modal>
      )}
      {modal === 'payouts' && briefing && (
        <Modal title={`Paid to workers · ${briefing.period.label}`} onClose={() => setModal(null)}>
          <p className="font-mono font-black text-2xl text-theme-heading mb-4">{fmtMoney(sc?.worker_payouts ?? 0, currency)}</p>
          {(charts?.pay_vs_hours.length ?? 0) === 0 ? (
            <DataAlert>No payslips. Run Calculate on Finance.</DataAlert>
          ) : (
            <>
              <div className="h-[220px] mb-4"><Bar data={payBar} options={chartOptions} /></div>
              <ul className="divide-y divide-white/[0.05]">
                {(charts?.pay_vs_hours ?? []).map((r) => (
                  <li key={r.worker_id ?? r.name} className="flex justify-between py-2 text-sm gap-3">
                    <span className="text-theme-heading truncate">{r.name}</span>
                    <span className="font-mono shrink-0">{fmtHours(r.hours)} · {fmtMoney(r.paid, currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Modal>
      )}
      {modal === 'fleet' && briefing && (
        <Modal title="Machines this week" onClose={() => setModal(null)}>
          <p className="text-sm text-theme-muted mb-4">
            {sc?.producing_rdps ?? 0} working · {sc?.parked_rdps ?? 0} unused · {sc?.rdp_count ?? 0} total
          </p>
          <div className="h-[220px]"><Bar data={fleetBar} options={chartOptions} /></div>
        </Modal>
      )}
      {modal === 'quality' && briefing && (
        <Modal title={`Quality · ${briefing.period.label}`} onClose={() => setModal(null)}>
          <p className="font-mono font-black text-2xl text-theme-heading mb-4">
            {sc?.quality_avg != null ? sc.quality_avg.toFixed(1) : '—'} avg · {sc?.quality_count ?? 0} scores
          </p>
          {(charts?.quality_buckets.every((b) => b.count === 0) ?? true) ? (
            <DataAlert>No quality scores this month.</DataAlert>
          ) : (
            <div className="h-[220px]"><Bar data={qualityBar} options={chartOptions} /></div>
          )}
        </Modal>
      )}
      {modal === 'blind' && briefing && (
        <Modal title="Hours with no payslip" onClose={() => setModal(null)}>
          <p className="text-sm text-theme-muted mb-3">
            People with work hours in {scopeLabel} but no payslip. Run Calculate or they will not get paid.
          </p>
          <p className="font-mono font-black text-2xl text-theme-heading mb-4">{sc?.workers_with_hours_no_payslip ?? 0} workers</p>
          <Link href="/admin/payroll" className="text-sm text-emerald-accent hover:underline inline-flex items-center gap-1">
            Open Finance <ExternalLink size={12} />
          </Link>
        </Modal>
      )}
    </div>
  );
}
