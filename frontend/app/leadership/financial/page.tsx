'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArcElement,
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
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Clock, DollarSign, ExternalLink, Users, Wallet, X } from 'lucide-react';

import AnalyticsViewToggle, { type AnalyticsView } from '@/components/platform/AnalyticsViewToggle';
import DataAlert from '@/components/platform/DataAlert';
import KpiCard from '@/components/platform/KpiCard';
import PageHeader from '@/components/platform/PageHeader';
import PeriodFilter from '@/components/platform/PeriodFilter';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { enteredPayMinutes, rdpConnectedMinutes } from '@/lib/hours';
import {
  gatherIntelligence,
  num,
  type IntelligenceSnapshot,
  type PayslipRow,
  type PayrollLine,
  type RdpEarningsOwner,
  type RdpEarningsRow,
  type RevenueShareRow,
  type SessionRow,
  type Source,
} from '@/lib/intelligence/engine';
import { pickCurrentPeriod } from '@/lib/periods';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
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

type ModalKind = 'earnings' | 'payouts' | 'hours' | 'clients' | 'worker' | null;

interface ClientRecord {
  id: string;
  name: string;
  platform?: string;
}

interface ClientRevenueRow {
  clientId: string;
  name: string;
  platform: string;
  sessions: number;
  rdpCount: number;
  earned: number;
}

const EMERALD = '#3FC7A0';
const GOLD = '#D4AF37';
const BLUE = '#60A5FA';
const TICK = 'rgba(148, 163, 184, 0.9)';
const GRID = 'rgba(148, 163, 184, 0.12)';

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

const doughnutOptions: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: {
    legend: { position: 'bottom', labels: { color: TICK, boxWidth: 10, usePointStyle: true } },
  },
};

const fmt = (x: number, currency = 'USD') =>
  `${currency} ${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function inPeriod(iso: string, period: PayrollPeriod): boolean {
  const day = iso.slice(0, 10);
  return day >= period.start_date.slice(0, 10) && day <= period.end_date.slice(0, 10);
}

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sessionMinutes(s: SessionRow): number {
  return enteredPayMinutes(s) || rdpConnectedMinutes(s) || 0;
}

function aggregateSnapshots(rows: IntelligenceSnapshot[]): IntelligenceSnapshot {
  const currencies = Array.from(new Set(rows.map((row) => row.rdp_earnings.data.currency).filter(Boolean)));
  const currency = currencies.length === 1 ? currencies[0] : 'Mixed';

  const payslipByWorker = new Map<string, PayslipRow>();
  for (const row of rows.flatMap((snapshot) => snapshot.payslips.data)) {
    const current = payslipByWorker.get(row.worker_id);
    payslipByWorker.set(row.worker_id, current ? {
      ...current,
      hours_logged: num(current.hours_logged) + num(row.hours_logged),
      gross_earned: num(current.gross_earned) + num(row.gross_earned),
      final_net: num(current.final_net) + num(row.final_net),
      total_deductions: num(current.total_deductions) + num(row.total_deductions),
      session_count: num(current.session_count) + num(row.session_count),
    } : { ...row });
  }

  const revenueByClient = new Map<string, RevenueShareRow>();
  for (const row of rows.flatMap((snapshot) => snapshot.revenue_share.data)) {
    const key = row.client_id ?? `${row.client_name}:${row.platform}`;
    const current = revenueByClient.get(key);
    revenueByClient.set(key, current ? {
      ...current,
      earnings: num(current.earnings) + num(row.earnings),
      worker_cost: num(current.worker_cost) + num(row.worker_cost),
      distributable: num(current.distributable) + num(row.distributable),
      gs_share: num(current.gs_share) + num(row.gs_share),
      owner_share: num(current.owner_share) + num(row.owner_share),
    } : { ...row });
  }

  const rdpById = new Map<string, RdpEarningsRow>();
  for (const row of rows.flatMap((snapshot) => snapshot.rdp_earnings.data.rdps)) {
    const current = rdpById.get(row.rdp_id);
    rdpById.set(row.rdp_id, current ? {
      ...current,
      produced: String(num(current.produced) + num(row.produced)),
      hours: String(num(current.hours) + num(row.hours)),
      session_count: current.session_count + row.session_count,
    } : { ...row });
  }

  const ownerByKey = new Map<string, RdpEarningsOwner>();
  for (const row of rows.flatMap((snapshot) => snapshot.rdp_earnings.data.owners)) {
    const current = ownerByKey.get(row.owner_key);
    ownerByKey.set(row.owner_key, current ? {
      ...current,
      rdp_count: current.rdp_count + row.rdp_count,
      hours: String(num(current.hours) + num(row.hours)),
      produced: String(num(current.produced) + num(row.produced)),
      gs_share: String(num(current.gs_share) + num(row.gs_share)),
      owner_share: String(num(current.owner_share) + num(row.owner_share)),
    } : { ...row });
  }

  const source = <T,>(blocks: Source<T>[], data: T): Source<T> => {
    return {
      ok: blocks.some((block) => block.ok),
      data,
      error: blocks.every((block) => !block.ok) ? blocks.map((block) => block.error).filter(Boolean).join(' · ') : null,
    };
  };

  return {
    period_id: 'all',
    payslips: source(rows.map((row) => row.payslips), Array.from(payslipByWorker.values())),
    revenue_share: source(rows.map((row) => row.revenue_share), Array.from(revenueByClient.values())),
    rdp_earnings: source(rows.map((row) => row.rdp_earnings), {
      currency,
      rdps: Array.from(rdpById.values()),
      owners: Array.from(ownerByKey.values()),
    }),
    line_items: source(rows.map((row) => row.line_items), rows.flatMap((row) => row.line_items.data)),
    sessions: source(rows.map((row) => row.sessions), rows.flatMap((row) => row.sessions.data)),
    quality: source(rows.map((row) => row.quality), rows.flatMap((row) => row.quality.data)),
    clients: source(rows.flatMap((row) => row.clients ? [row.clients] : []), rows[0]?.clients?.data ?? []),
    rdps: source(rows.flatMap((row) => row.rdps ? [row.rdps] : []), rows[0]?.rdps?.data ?? []),
    workers: source(rows.flatMap((row) => row.workers ? [row.workers] : []), rows[0]?.workers?.data ?? []),
    warnings: Array.from(new Set(rows.flatMap((row) => row.warnings))),
  };
}

function buildClientRevenueRows(snap: IntelligenceSnapshot | null): ClientRevenueRow[] {
  if (!snap) return [];

  const clients = (snap.clients?.data ?? []) as ClientRecord[];
  const revenueByClient = new Map<string, number>();
  for (const row of snap.revenue_share.data ?? []) {
    if (!row.client_id) continue;
    revenueByClient.set(row.client_id, (revenueByClient.get(row.client_id) ?? 0) + num(row.earnings));
  }

  const rdpAgg = new Map<string, { sessions: number; produced: number; rdpCount: number }>();
  for (const row of snap.rdp_earnings.data.rdps ?? []) {
    if (!row.client_id) continue;
    const cur = rdpAgg.get(row.client_id) ?? { sessions: 0, produced: 0, rdpCount: 0 };
    cur.sessions += row.session_count;
    cur.produced += num(row.produced);
    cur.rdpCount += 1;
    rdpAgg.set(row.client_id, cur);
  }

  const rdpClientMap = new Map<string, string>();
  for (const r of snap.rdps?.data ?? []) {
    const id = String(r.id ?? '');
    const cid = r.client_id ? String(r.client_id) : '';
    if (id && cid) rdpClientMap.set(id, cid);
  }

  const sessionsByClient = new Map<string, number>();
  for (const s of snap.sessions.data ?? []) {
    let cid = s.client_id ? String(s.client_id) : '';
    if (!cid && s.rdp_resource_id) cid = rdpClientMap.get(String(s.rdp_resource_id)) ?? '';
    if (!cid) continue;
    sessionsByClient.set(cid, (sessionsByClient.get(cid) ?? 0) + 1);
  }

  const rdpsPerClient = new Map<string, number>();
  for (const r of snap.rdps?.data ?? []) {
    const cid = r.client_id ? String(r.client_id) : '';
    if (!cid) continue;
    rdpsPerClient.set(cid, (rdpsPerClient.get(cid) ?? 0) + 1);
  }

  return clients
    .map((c) => {
      const rdp = rdpAgg.get(c.id);
      const earned = revenueByClient.has(c.id)
        ? revenueByClient.get(c.id)!
        : (rdp?.produced ?? 0);
      return {
        clientId: c.id,
        name: c.name,
        platform: c.platform ?? '—',
        sessions: rdp?.sessions ?? sessionsByClient.get(c.id) ?? 0,
        rdpCount: rdp?.rdpCount ?? rdpsPerClient.get(c.id) ?? 0,
        earned,
      };
    })
    .sort((a, b) => b.earned - a.earned || b.sessions - a.sessions || a.name.localeCompare(b.name));
}

function dailyForWorker(
  workerId: string,
  period: PayrollPeriod,
  lines: PayrollLine[],
  sessions: SessionRow[],
  payslip?: PayslipRow,
): { day: string; amount: number }[] {
  const byDay = new Map<string, number>();
  const sessMap = new Map(sessions.map((s) => [s.id, s]));
  const workerLines = lines.filter((l) => l.worker_id === workerId);

  if (workerLines.length > 0) {
    for (const line of workerLines) {
      const session = sessMap.get(line.session_id);
      const day = session?.start_time.slice(0, 10) ?? period.start_date.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + num(line.gross_amount));
    }
  } else {
    const scoped = sessions.filter((s) => s.worker_id === workerId && inPeriod(s.start_time, period));
    const gross = num(payslip?.gross_earned);
    const totalMin = scoped.reduce((sum, s) => sum + sessionMinutes(s), 0);
    if (scoped.length === 0) {
      if (gross > 0) byDay.set(period.start_date.slice(0, 10), gross);
    } else {
      for (const s of scoped) {
        const share = totalMin > 0
          ? gross * (sessionMinutes(s) / totalMin)
          : gross / scoped.length;
        const day = s.start_time.slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + share);
      }
    }
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, amount]) => ({ day, amount }));
}

function ClickableKpi({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left w-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-accent/50">
      {children}
    </button>
  );
}


function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`glass-modal bg-brand-card flex flex-col overflow-hidden rounded-2xl border border-theme shadow-2xl ${
          wide
            ? 'w-full max-w-6xl max-h-[min(92vh,880px)]'
            : 'w-full max-w-lg max-h-[90vh] overflow-y-auto'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-theme px-5 py-4 shrink-0 bg-brand-surface-low">
          <h2 className="text-base font-black text-theme-heading">{title}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-brand-surface-high">
            <X size={14} />
          </button>
        </div>
        <div className={wide ? 'flex-1 min-h-0 overflow-y-auto p-4 sm:p-6' : 'p-5'}>{children}</div>
      </div>
    </div>
  );
}

export default function FinancialIntelligencePage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [snap, setSnap] = useState<IntelligenceSnapshot | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [snapError, setSnapError] = useState<string | null>(null);
  const [view, setView] = useState<AnalyticsView>('cards');
  const [workerFilter, setWorkerFilter] = useState('');
  const [modal, setModal] = useState<ModalKind>(null);

  useEffect(() => {
    api.get<PayrollPeriod[]>('/payroll/periods')
      .then((list) => {
        setPeriods(list);
        if (list.length > 0) setPeriodId(pickCurrentPeriod(list)?.id ?? list[0].id);
      })
      .catch((e) => setPeriodsError(e instanceof Error ? e.message : 'Failed to load working months.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (periods.length === 0) return;
    setReportsLoading(true);
    setWorkerFilter('');
    setSnapError(null);
    const scopeIds = periodId ? [periodId] : periods.map((period) => period.id);
    Promise.allSettled(scopeIds.map((id) => gatherIntelligence(id)))
      .then((results) => {
        const loaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
        if (loaded.length === 0) throw new Error('Failed to load intelligence.');
        const next = periodId ? loaded[0] : aggregateSnapshots(loaded);
        const failed = results.length - loaded.length;
        setSnap(failed > 0
          ? { ...next, warnings: [...next.warnings, `${failed} working month${failed === 1 ? '' : 's'} did not load.`] }
          : next);
      })
      .catch((e) => setSnapError(e instanceof Error ? e.message : 'Failed to load intelligence.'))
      .finally(() => setReportsLoading(false));
  }, [periodId, periods]);

  const selectedPeriod = periods.find((p) => p.id === periodId) ?? null;
  const orderedPeriods = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const selected = selectedPeriod ?? (!periodId && periods.length > 0 ? {
    id: '',
    label: 'All working months',
    start_date: orderedPeriods[0].start_date,
    end_date: orderedPeriods[orderedPeriods.length - 1].end_date,
    currency: snap?.rdp_earnings.data.currency ?? 'USD',
    status: 'all',
  } : null);
  const currency = selected?.currency ?? snap?.rdp_earnings.data.currency ?? 'USD';
  const payslips = snap?.payslips.data ?? [];
  const lines = snap?.line_items.data ?? [];
  const sessions = snap?.sessions.data ?? [];

  const kpis = useMemo(() => {
    const workerEarnings = payslips.reduce((s, r) => s + num(r.gross_earned), 0);
    const workerPayouts = payslips.reduce((s, r) => s + num(r.final_net), 0);
    const hours = payslips.reduce((s, r) => s + num(r.hours_logged), 0);
    const clientRevenue = buildClientRevenueRows(snap).reduce((s, r) => s + r.earned, 0);
    return { workerEarnings, workerPayouts, hours, clientRevenue };
  }, [payslips, snap]);

  const ranked = useMemo(
    () => [...payslips].sort((a, b) => num(b.final_net) - num(a.final_net) || num(b.gross_earned) - num(a.gross_earned)),
    [payslips],
  );
  const top5 = ranked.slice(0, 5);
  const selectedPayslip = payslips.find((p) => p.worker_id === workerFilter) ?? null;
  const workerDaily = useMemo(() => {
    if (!selected || !selectedPayslip) return [];
    return dailyForWorker(selectedPayslip.worker_id, selected, lines, sessions, selectedPayslip);
  }, [selected, selectedPayslip, lines, sessions]);

  const periodDaily = useMemo(() => {
    if (!selected) return [];
    const byDay = new Map<string, number>();
    for (const row of payslips) {
      for (const point of dailyForWorker(row.worker_id, selected, lines, sessions, row)) {
        byDay.set(point.day, (byDay.get(point.day) ?? 0) + point.amount);
      }
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, amount]) => ({ day, amount }));
  }, [payslips, selected, lines, sessions]);

  const clientRevenueRows = useMemo(() => buildClientRevenueRows(snap), [snap]);

  const workerChart: ChartData<'doughnut'> = {
    labels: top5.map((r) => r.worker_display_name),
    datasets: [{
      data: top5.map((r) => num(r.gross_earned)),
      backgroundColor: [EMERALD, GOLD, BLUE, '#A78BFA', '#F87171'],
      borderWidth: 0,
    }],
  };

  const clientChart: ChartData<'bar'> = {
    labels: clientRevenueRows.slice(0, 8).map((r) => r.name),
    datasets: [{
      label: 'Earned',
      data: clientRevenueRows.slice(0, 8).map((r) => r.earned),
      backgroundColor: GOLD,
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  const dailyChart: ChartData<'line'> = {
    labels: periodDaily.map((d) => dayLabel(d.day)),
    datasets: [{
      label: 'Worker earnings',
      data: periodDaily.map((d) => Number(d.amount.toFixed(2))),
      borderColor: EMERALD,
      backgroundColor: 'rgba(63, 199, 160, 0.12)',
      fill: true,
      tension: 0.35,
    }],
  };

  const workerDailyChart: ChartData<'line'> = {
    labels: workerDaily.map((d) => dayLabel(d.day)),
    datasets: [{
      label: selectedPayslip?.worker_display_name ?? 'Worker',
      data: workerDaily.map((d) => Number(d.amount.toFixed(2))),
      borderColor: GOLD,
      backgroundColor: 'rgba(212, 175, 55, 0.12)',
      fill: true,
      tension: 0.35,
    }],
  };

  if (loading) {
    return <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>;
  }
  if (periodsError) return <DataAlert tone="error">{periodsError}</DataAlert>;
  if (periods.length === 0) {
    return <DataAlert>No working months yet. Create one on the Finance page.</DataAlert>;
  }

  const modalWorker = modal === 'worker' ? selectedPayslip : null;

  return (
    <div>
      <PageHeader
        title="Financial Intelligence"
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

      {snapError ? (
        <div className="mb-4 mt-4">
          <DataAlert tone="error">{snapError}</DataAlert>
        </div>
      ) : null}

      {snap?.warnings.length ? (
        <div className="mb-4 mt-4">
          <DataAlert tone="warning">
            Some sources did not load ({snap.warnings.join(' · ')}). Figures below use whatever arrived.
          </DataAlert>
        </div>
      ) : null}

      {reportsLoading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : !snap ? (
        snapError ? null : (
          <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
        )
      ) : (
        <div className="rounded-2xl border border-theme bg-brand-surface-low/80 p-4 sm:p-6 space-y-6">
          {snap.payslips.ok && payslips.length === 0 ? (
            <DataAlert tone="warning">No payslips for {selected?.label}. Run Calculate on Finance.</DataAlert>
          ) : null}

          {view === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ClickableKpi onClick={() => setModal('earnings')}>
                <KpiCard label="Total worker earnings" value={fmt(kpis.workerEarnings, currency)} icon={DollarSign} accent="gold" />
              </ClickableKpi>
              <ClickableKpi onClick={() => setModal('payouts')}>
                <KpiCard label="Paid to workers" value={fmt(kpis.workerPayouts, currency)} icon={Wallet} />
              </ClickableKpi>
              <ClickableKpi onClick={() => setModal('hours')}>
                <KpiCard label="Hours logged" value={`${kpis.hours.toLocaleString(undefined, { maximumFractionDigits: 2 })}h`} icon={Clock} />
              </ClickableKpi>
              <ClickableKpi onClick={() => setModal('clients')}>
                <KpiCard label="Client / RDP earnings" value={fmt(kpis.clientRevenue, currency)} icon={Users} accent="blue" />
              </ClickableKpi>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="glass-panel p-4 h-[300px] border border-emerald-accent/15 bg-brand-card">
                <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-2">Top 5 earnings</p>
                {top5.length === 0 ? <DataAlert>No payslip rows yet.</DataAlert> : <Doughnut data={workerChart} options={doughnutOptions} />}
              </div>
              <div className="glass-panel p-4 h-[300px] border border-gold-accent/15 bg-brand-card">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gold-accent mb-2">Revenue by client</p>
                {clientRevenueRows.length === 0 ? (
                  <DataAlert>No clients configured.</DataAlert>
                ) : (
                  <Bar data={clientChart} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: false } } }} />
                )}
              </div>
              <div className="glass-panel p-4 h-[300px] border border-emerald-accent/15 bg-brand-card">
                <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-2">Earnings per day</p>
                {periodDaily.length === 0 ? <DataAlert>No daily earnings to chart.</DataAlert> : <Line data={dailyChart} options={lineOptions} />}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-theme bg-brand-surface-container px-4 py-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-emerald-accent mb-1.5 block">Worker</label>
              <select
                value={workerFilter}
                onChange={(e) => {
                  setWorkerFilter(e.target.value);
                  if (e.target.value) setModal('worker');
                }}
                className="input-field w-full max-w-none sm:max-w-sm bg-brand-surface-low border-theme"
              >
                <option value="">All workers ({payslips.length} payslips)</option>
                {ranked.map((r) => (
                  <option key={r.worker_id} value={r.worker_id}>
                    {r.worker_display_name} · {fmt(num(r.gross_earned), currency)}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-gold-accent/25 bg-gold-accent/[0.04] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gold-accent">Clients</p>
                <p className="text-sm text-theme-muted mt-0.5">
                  {clientRevenueRows.length} client{clientRevenueRows.length === 1 ? '' : 's'} · {fmt(kpis.clientRevenue, currency)} earned
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModal('clients')}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-gold-accent/35 bg-gold-accent/10 text-gold-accent text-xs font-bold uppercase tracking-wide hover:bg-gold-accent/15 transition-colors shrink-0"
              >
                Revenue by client
                <ExternalLink size={12} />
              </button>
            </div>
          </div>

          <div className="glass-panel p-5 sm:p-6 border border-gold-accent/20 bg-brand-card">
            <h2 className="font-bold text-theme-heading mb-4 flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-gold-accent" />
              Top 5 paid workers
            </h2>
            {top5.length === 0 ? (
              <DataAlert>No worker payslips for this month.</DataAlert>
            ) : (
              <ul className="divide-y divide-theme">
                {top5.map((r, idx) => (
                  <li key={r.worker_id}>
                    <button
                      type="button"
                      className="w-full flex justify-between py-2.5 text-sm gap-3 text-left hover:bg-brand-surface-high rounded-lg px-1 transition-colors"
                      onClick={() => { setWorkerFilter(r.worker_id); setModal('worker'); }}
                    >
                      <span className="text-theme-heading truncate">#{idx + 1} {r.worker_display_name}</span>
                      <span className="font-mono text-emerald-accent shrink-0">
                        {fmt(num(r.final_net), currency)}
                        <span className="text-theme-muted ml-2">earned {fmt(num(r.gross_earned), currency)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {modal === 'earnings' && (
        <Modal title={`All worker earnings · ${selected?.label ?? ''}`} onClose={() => setModal(null)}>
          <ul className="divide-y divide-theme">
            {ranked.map((r) => (
              <li key={r.worker_id} className="flex justify-between py-2 text-sm gap-3">
                <button type="button" className="text-left text-theme-heading truncate hover:underline" onClick={() => { setWorkerFilter(r.worker_id); setModal('worker'); }}>
                  {r.worker_display_name}
                </button>
                <span className="font-mono text-gold-accent shrink-0">{fmt(num(r.gross_earned), currency)}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {modal === 'payouts' && (
        <Modal title={`Paid to workers · ${selected?.label ?? ''}`} onClose={() => setModal(null)}>
          <ul className="divide-y divide-theme">
            {ranked.map((r) => (
              <li key={r.worker_id} className="flex justify-between py-2 text-sm gap-3">
                <span className="text-theme-heading truncate">{r.worker_display_name}</span>
                <span className="font-mono text-emerald-accent shrink-0">{fmt(num(r.final_net), currency)}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {modal === 'hours' && (
        <Modal title={`Hours logged · ${selected?.label ?? ''}`} onClose={() => setModal(null)}>
          <ul className="divide-y divide-theme">
            {ranked.map((r) => (
              <li key={r.worker_id} className="flex justify-between py-2 text-sm gap-3">
                <span className="text-theme-heading truncate">{r.worker_display_name}</span>
                <span className="font-mono text-theme-heading shrink-0">{num(r.hours_logged).toFixed(2)}h</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {modal === 'clients' && (
        <Modal
          wide={clientRevenueRows.length > 0}
          title={`Revenue by client · ${selected?.label ?? ''}`}
          onClose={() => setModal(null)}
        >
          {clientRevenueRows.length === 0 ? (
            <div className="py-6 flex items-center justify-center">
              <DataAlert>No clients configured. Add clients on the Admin Clients page.</DataAlert>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="rounded-xl border border-theme bg-brand-surface-low px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase text-theme-muted">Clients</p>
                  <p className="text-lg font-black text-theme-heading tabular-nums">{clientRevenueRows.length}</p>
                </div>
                <div className="rounded-xl border border-theme bg-brand-surface-low px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase text-theme-muted">Sessions</p>
                  <p className="text-lg font-black text-theme-heading tabular-nums">
                    {clientRevenueRows.reduce((s, r) => s + r.sessions, 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-theme bg-brand-surface-low px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase text-theme-muted">Machines</p>
                  <p className="text-lg font-black text-theme-heading tabular-nums">
                    {clientRevenueRows.reduce((s, r) => s + r.rdpCount, 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-gold-accent/25 bg-gold-accent/[0.06] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase text-gold-accent">Total earned</p>
                  <p className="text-lg font-black text-gold-accent tabular-nums">{fmt(kpis.clientRevenue, currency)}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-theme">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme bg-brand-surface-low text-left">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Client</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Platform</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted text-right">Sessions</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted text-right">Machines</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gold-accent text-right">Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme">
                    {clientRevenueRows.map((r) => (
                      <tr key={r.clientId} className="hover:bg-brand-surface-high/60 transition-colors">
                        <td className="px-4 py-3 font-medium text-theme-heading">{r.name}</td>
                        <td className="px-4 py-3 text-theme-muted">{r.platform}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-theme-heading">{r.sessions}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-theme-heading">{r.rdpCount}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-gold-accent">{fmt(r.earned, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}
      {modal === 'worker' && modalWorker && selected && (
        <Modal title={`${modalWorker.worker_display_name} · ${selected.label}`} onClose={() => setModal(null)}>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div>
              <p className="text-[10px] font-bold uppercase text-theme-muted">Earned</p>
              <p className="font-mono font-bold text-gold-accent">{fmt(num(modalWorker.gross_earned), currency)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-theme-muted">Paid</p>
              <p className="font-mono font-bold text-emerald-accent">{fmt(num(modalWorker.final_net), currency)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-theme-muted">Hours</p>
              <p className="font-mono font-bold text-theme-heading">{num(modalWorker.hours_logged).toFixed(2)}h</p>
            </div>
          </div>
          {workerDaily.length === 0 ? (
            <DataAlert>No daily breakdown for this worker in the month.</DataAlert>
          ) : (
            <>
              <div className="h-[220px] mb-4">
                <Line data={workerDailyChart} options={lineOptions} />
              </div>
              <ul className="divide-y divide-theme">
                {workerDaily.map((d) => (
                  <li key={d.day} className="flex justify-between py-2 text-sm">
                    <span className="text-theme-muted">{dayLabel(d.day)}</span>
                    <span className="font-mono text-theme-heading">{fmt(d.amount, currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
