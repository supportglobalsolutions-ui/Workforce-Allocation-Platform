'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, ChevronLeft, ChevronRight, Clock, DollarSign, Plus, Users,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import NewWorkPeriodModal, { WorkPeriodCreated } from '@/components/payroll/NewWorkPeriodModal';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

type PeriodStatus = 'open' | 'calculated' | 'approved' | 'paid';

interface WorkingPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  currency: string;
  status: PeriodStatus;
  wallet_pushed_at: string | null;
  paid_at: string | null;
  created_at: string;
}

interface PeriodSummary {
  hours_logged: string | number;
  gross_earned: string | number;
  final_net: string | number;
  base_equivalent: string | number;
  base_currency: string | null;
}

interface PeriodStats {
  workers: number;
  hours: number;
  gross: number;
  net: number;
  currency: string;
}

const STATUS_STYLE: Record<PeriodStatus, string> = {
  open: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  calculated: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  approved: 'bg-emerald-accent/15 text-emerald-accent border-emerald-accent/30',
  paid: 'bg-gold-accent/15 text-gold-accent border-gold-accent/30',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function n(v: string | number | null | undefined): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function money(amount: number, currency = 'USD'): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isoDay(d: string): string {
  return d.slice(0, 10);
}

/** Local noon date from YYYY-MM-DD to avoid DST edge issues. */
function ymdToDate(iso: string): Date {
  const [y, m, d] = isoDay(iso).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtLongRange(start: string, end: string): string {
  const a = ymdToDate(start);
  const b = ymdToDate(end);
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
  return `${a.toLocaleDateString(undefined, opts)} → ${b.toLocaleDateString(undefined, opts)}`;
}

function coversToday(p: WorkingPeriod, todayYmd: string): boolean {
  const s = isoDay(p.start_date);
  const e = isoDay(p.end_date);
  return s <= todayYmd && todayYmd <= e;
}

function aggregateSummaries(rows: PeriodSummary[], fallbackCurrency: string): PeriodStats {
  return {
    workers: rows.length,
    hours: rows.reduce((s, r) => s + n(r.hours_logged), 0),
    gross: rows.reduce((s, r) => s + n(r.gross_earned), 0),
    net: rows.reduce((s, r) => s + n(r.base_equivalent ?? r.final_net), 0),
    currency: rows[0]?.base_currency || fallbackCurrency || 'USD',
  };
}

/** Calendar months (year/month) touched by the period, inclusive. */
function monthsInRange(startIso: string, endIso: string): { year: number; month: number }[] {
  const start = ymdToDate(startIso);
  const end = ymdToDate(endIso);
  const out: { year: number; month: number }[] = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

function buildMonthCells(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1, 12, 0, 0);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startPad = first.getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WorkingPeriodCalendarPage() {
  const [periods, setPeriods] = useState<WorkingPeriod[]>([]);
  const [statsById, setStatsById] = useState<Record<string, PeriodStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async (preferId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.get<WorkingPeriod[]>('/payroll/periods');
      // Chronological: oldest → newest (← older, → newer)
      const sorted = [...list].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      );
      setPeriods(sorted);

      const today = dateToYmd(new Date());
      const preferred = preferId && sorted.find((p) => p.id === preferId);
      const current = preferred
        ?? sorted.find((p) => coversToday(p, today))
        ?? sorted[sorted.length - 1]
        ?? null;
      setSelectedId((prev) => {
        if (preferId && sorted.some((p) => p.id === preferId)) return preferId;
        if (prev && sorted.some((p) => p.id === prev)) return prev;
        return current?.id ?? null;
      });

      const entries = await Promise.all(
        sorted.map(async (p) => {
          try {
            const rows = await api.get<PeriodSummary[]>(`/payroll/periods/${p.id}/summaries`);
            return [p.id, aggregateSummaries(rows, p.currency)] as const;
          } catch {
            return [p.id, { workers: 0, hours: 0, gross: 0, net: 0, currency: p.currency }] as const;
          }
        }),
      );
      setStatsById(Object.fromEntries(entries));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load work periods.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const index = periods.findIndex((p) => p.id === selectedId);
  const selected = index >= 0 ? periods[index] : null;
  const stats = selected ? statsById[selected.id] : null;
  const canPrev = index > 0;
  const canNext = index >= 0 && index < periods.length - 1;

  const todayYmd = useMemo(() => dateToYmd(new Date()), []);
  const startYmd = selected ? isoDay(selected.start_date) : '';
  const endYmd = selected ? isoDay(selected.end_date) : '';
  const monthBlocks = useMemo(
    () => (selected ? monthsInRange(selected.start_date, selected.end_date) : []),
    [selected],
  );

  function go(delta: number) {
    if (index < 0) return;
    const next = periods[index + delta];
    if (next) setSelectedId(next.id);
  }

  async function handleCreated(created: WorkPeriodCreated) {
    setShowCreate(false);
    await load(created.id);
  }

  return (
    <div>
      <PageHeader
        title="Work Period Calendar"
        description="Browse work periods on a calendar. Create new ones here; use Payroll to calculate and pay."
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-primary text-sm py-2 px-4 flex items-center gap-2"
          >
            <Plus size={14} /> New work period
          </button>
        }
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      {loading ? (
        <div className="flex justify-center py-20"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      ) : periods.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-white/10 px-6 py-16 text-center max-w-4xl mx-auto">
          <p className="text-sm text-theme-muted">No work periods yet.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2 mt-4"
          >
            <Plus size={14} /> New work period
          </button>
        </div>
      ) : selected ? (
        <div className="space-y-5 max-w-4xl mx-auto">
          {/* Work period navigator: < previous · > next */}
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={!canPrev}
              title={canPrev ? 'Previous work period' : 'No previous work period'}
              aria-label="Previous work period"
              className="shrink-0 h-11 px-3 sm:px-4 rounded-xl border border-white/15 bg-white/[0.04] flex items-center gap-1.5 text-sm font-semibold text-white hover:bg-white/[0.08] hover:border-emerald-accent/40 disabled:opacity-35 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={18} />
              <span className="hidden sm:inline">Prev</span>
            </button>

            <div className="flex-1 min-w-0 text-center px-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-theme-muted mb-1">
                Work period
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-theme-heading tracking-tight">
                  {selected.label}
                </h2>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_STYLE[selected.status]}`}>
                  {selected.status}
                </span>
              </div>
              <p className="text-sm text-theme-muted mt-1">
                {fmtLongRange(selected.start_date, selected.end_date)}
              </p>
              <p className="text-[11px] text-theme-muted/80 mt-0.5">
                Work period {index + 1} of {periods.length}
                {coversToday(selected, todayYmd) ? ' · current' : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => go(1)}
              disabled={!canNext}
              title={canNext ? 'Next work period' : 'No next work period'}
              aria-label="Next work period"
              className="shrink-0 h-11 px-3 sm:px-4 rounded-xl border border-white/15 bg-white/[0.04] flex items-center gap-1.5 text-sm font-semibold text-white hover:bg-white/[0.08] hover:border-emerald-accent/40 disabled:opacity-35 disabled:pointer-events-none transition-colors"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Stats for this period only */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard compact label="Workers" value={stats?.workers ?? 0} icon={Users} accent="blue" />
            <KpiCard compact label="Hours" value={(stats?.hours ?? 0).toFixed(1)} icon={Clock} />
            <KpiCard
              compact
              label="Gross"
              value={stats ? money(stats.gross, selected.currency) : '—'}
              icon={DollarSign}
            />
            <KpiCard
              compact
              label="Net payout"
              value={stats ? money(stats.net, stats.currency) : '—'}
              icon={DollarSign}
              accent="gold"
            />
          </div>

          {/* Day calendar */}
          <section className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-theme-heading">Calendar</h3>
                <p className="text-[11px] text-theme-muted mt-0.5">
                  In-range days highlighted · start and end marked
                </p>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-theme-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-accent" /> Start
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gold-accent" /> End
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-accent/25 border border-emerald-accent/40" /> In period
                </span>
              </div>
            </div>

            <div className={`p-4 sm:p-6 grid gap-6 ${monthBlocks.length > 1 ? 'lg:grid-cols-2' : ''}`}>
              {monthBlocks.map(({ year, month }) => {
                const cells = buildMonthCells(year, month);
                const title = new Date(year, month, 1).toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                });
                return (
                  <div key={`${year}-${month}`}>
                    <p className="text-sm font-bold text-theme-heading mb-3 text-center">{title}</p>
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {WEEKDAYS.map((d) => (
                        <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-theme-muted py-1">
                          {d}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {cells.map((day, i) => {
                        if (day == null) {
                          return <div key={`e-${i}`} className="aspect-square" />;
                        }
                        const ymd = dateToYmd(new Date(year, month, day, 12, 0, 0));
                        const inRange = ymd >= startYmd && ymd <= endYmd;
                        const isStart = ymd === startYmd;
                        const isEnd = ymd === endYmd;
                        const isToday = ymd === todayYmd;

                        return (
                          <div
                            key={ymd}
                            className={[
                              'relative aspect-square rounded-xl flex flex-col items-center justify-center text-sm transition-colors',
                              inRange
                                ? 'bg-emerald-accent/15 text-white border border-emerald-accent/25'
                                : 'text-theme-muted/50',
                              isStart ? 'ring-2 ring-emerald-accent bg-emerald-accent/25 border-emerald-accent/50' : '',
                              isEnd && !isStart ? 'ring-2 ring-gold-accent bg-gold-accent/20 border-gold-accent/40' : '',
                              isStart && isEnd ? 'ring-2 ring-emerald-accent' : '',
                              isToday && !isStart && !isEnd ? 'outline outline-1 outline-white/30' : '',
                            ].join(' ')}
                          >
                            <span className={`font-semibold tabular-nums ${isStart || isEnd ? 'text-base' : ''}`}>
                              {day}
                            </span>
                            {(isStart || isEnd) && (
                              <span
                                className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase tracking-wide leading-none ${
                                  isStart ? 'text-emerald-accent' : 'text-gold-accent'
                                }`}
                              >
                                {isStart && isEnd ? 'Start · End' : isStart ? 'Start' : 'End'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-theme-muted px-1">
            <dl className="flex flex-wrap gap-x-5 gap-y-1">
              <div className="flex gap-1.5">
                <dt>Currency</dt>
                <dd className="font-semibold text-white">{selected.currency}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Wallets</dt>
                <dd className="font-semibold text-white">
                  {selected.wallet_pushed_at ? new Date(selected.wallet_pushed_at).toLocaleDateString() : '—'}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Paid</dt>
                <dd className="font-semibold text-white">
                  {selected.paid_at ? new Date(selected.paid_at).toLocaleDateString() : '—'}
                </dd>
              </div>
            </dl>
            <Link href="/admin/payroll" className="text-emerald-accent hover:underline font-semibold">
              Calculate &amp; pay in Payroll →
            </Link>
          </div>
        </div>
      ) : null}

      {showCreate && (
        <NewWorkPeriodModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
