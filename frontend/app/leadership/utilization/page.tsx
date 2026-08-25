'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
import {
  Activity,
  CalendarRange,
  Clock3,
  Eye,
  HeartPulse,
  RefreshCw,
  Server,
  ShieldAlert,
  TimerOff,
  Users,
  Wrench,
  X,
  Zap,
  Info,
} from 'lucide-react';

import AnalyticsViewToggle, { type AnalyticsView } from '@/components/platform/AnalyticsViewToggle';
import DataAlert from '@/components/platform/DataAlert';
import KpiCard from '@/components/platform/KpiCard';
import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

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

type RangeDays = 7 | 30 | 90;
type RangeMode = RangeDays | 'custom';

interface RdpResource {
  id: string;
  nickname: string;
  country?: string | null;
  client_group?: string | null;
  client_name?: string | null;
  status: string;
  assigned_worker_id?: string | null;
  assigned_worker_name?: string | null;
  last_health_check_at?: string | null;
  health_notes?: string | null;
  risk_flags?: unknown[] | null;
}

interface WorkSession {
  id: string;
  worker_id: string;
  rdp_resource_id?: string | null;
  payroll_period_id?: string | null;
  start_time: string;
  end_time: string | null;
  image_start_at?: string | null;
  image_end_at?: string | null;
}

interface Worker {
  id: string;
  display_name: string;
  email?: string | null;
  status?: string | null;
}

interface Shift {
  id: string;
  worker_id: string;
  rdp_resource_id?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
}

interface PayrollLineItem {
  id: string;
  session_id: string;
  payroll_period_id: string;
  gross_amount: number | string;
}

interface PayrollPeriod {
  id: string;
  currency: string;
}

interface DayBucket {
  key: string;
  label: string;
  longLabel: string;
  start: number;
  end: number;
}

interface MachineMetric {
  machine: RdpResource;
  live: boolean;
  healthy: boolean;
  sessionCount: number;
  workerIds: string[];
  workerNames: string[];
  rdpMinutes: number;
  workMinutes: number;
  idleMinutes: number;
  connectedRate: number;
  workCoverage: number;
  revenueByCurrency: Record<string, number>;
}

interface TimeInterval {
  start: number;
  end: number;
}

const EMERALD = '#3FC7A0';
const BLUE = '#60A5FA';
const GOLD = '#D4AF37';
const RED = '#F87171';
const PURPLE = '#A78BFA';
const CYAN = '#22D3EE';
const GRID = 'rgba(148, 163, 184, 0.12)';
const TICK = 'rgba(148, 163, 184, 0.9)';
const ONLINE = new Set(['online_free', 'assigned', 'active', 'idle']);
const HEALTHY = new Set(['online_free', 'assigned', 'active', 'idle']);
const SHIFT_EXCLUDED = new Set(['rejected', 'cancelled']);
const STATUS_ORDER = [
  'active',
  'online_free',
  'assigned',
  'idle',
  'maintenance',
  'unhealthy',
  'offline',
  'admin_locked',
];
const STATUS_COLORS: Record<string, string> = {
  active: EMERALD,
  online_free: BLUE,
  assigned: CYAN,
  idle: GOLD,
  maintenance: PURPLE,
  unhealthy: RED,
  offline: '#64748B',
  admin_locked: '#FB7185',
};

const baseChartOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: TICK, boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 18 },
    },
    tooltip: {
      backgroundColor: 'rgba(2, 6, 23, 0.96)',
      borderColor: 'rgba(63, 199, 160, 0.25)',
      borderWidth: 1,
      padding: 12,
    },
  },
  scales: {
    x: { grid: { color: GRID }, ticks: { color: TICK } },
    y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK } },
  },
};

const lineChartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: TICK, boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 18 },
    },
    tooltip: {
      backgroundColor: 'rgba(2, 6, 23, 0.96)',
      borderColor: 'rgba(63, 199, 160, 0.25)',
      borderWidth: 1,
      padding: 12,
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: TICK, maxRotation: 0 } },
    y: {
      beginAtZero: true,
      grid: { color: GRID },
      ticks: { color: TICK, callback: (value) => `${value}h` },
    },
  },
};

const doughnutChartOptions: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '66%',
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: TICK, boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 18 },
    },
    tooltip: {
      backgroundColor: 'rgba(2, 6, 23, 0.96)',
      borderColor: 'rgba(63, 199, 160, 0.25)',
      borderWidth: 1,
      padding: 12,
    },
  },
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dayKey(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function createDayBuckets(range: RangeDays, now: number): DayBucket[] {
  const first = new Date(now);
  first.setHours(0, 0, 0, 0);
  first.setDate(first.getDate() - (range - 1));
  const buckets: DayBucket[] = [];
  for (let index = 0; index < range; index += 1) {
    const startDate = new Date(first);
    startDate.setDate(first.getDate() + index);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    buckets.push({
      key: dayKey(startDate),
      label: range === 7
        ? startDate.toLocaleDateString(undefined, { weekday: 'short' })
        : startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      longLabel: startDate.toLocaleDateString(undefined, {
        weekday: 'long', month: 'short', day: 'numeric',
      }),
      start: startDate.getTime(),
      end: endDate.getTime(),
    });
  }
  return buckets;
}

function createCustomDayBuckets(from: string, to: string): DayBucket[] {
  const first = new Date(`${from}T00:00:00`);
  const last = new Date(`${to}T00:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return [];
  const buckets: DayBucket[] = [];
  const cursor = new Date(first);
  while (cursor <= last) {
    const startDate = new Date(cursor);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    buckets.push({
      key: dayKey(startDate),
      label: startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      longLabel: startDate.toLocaleDateString(undefined, {
        weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
      }),
      start: startDate.getTime(),
      end: endDate.getTime(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}

function clippedInterval(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  from: number,
  to: number,
): TimeInterval | null {
  if (!startIso) return null;
  const rawStart = new Date(startIso).getTime();
  const rawEnd = endIso ? new Date(endIso).getTime() : to;
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) return null;
  const start = Math.max(rawStart, from);
  const end = Math.min(rawEnd, to);
  return end > start ? { start, end } : null;
}

function mergedMinutes(intervals: TimeInterval[]): number {
  if (intervals.length === 0) return 0;
  const ordered = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  let totalMs = 0;
  let currentStart = ordered[0].start;
  let currentEnd = ordered[0].end;
  for (let index = 1; index < ordered.length; index += 1) {
    const interval = ordered[index];
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      totalMs += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }
  totalMs += currentEnd - currentStart;
  return totalMs / 60_000;
}

function sessionMinutes(
  sessions: WorkSession[],
  startField: 'start_time' | 'image_start_at',
  endField: 'end_time' | 'image_end_at',
  from: number,
  to: number,
): number {
  const intervals = sessions.flatMap((session) => {
    const interval = clippedInterval(session[startField], session[endField], from, to);
    return interval ? [interval] : [];
  });
  return mergedMinutes(intervals);
}

async function fetchSessionsInWindow(from: number, to: number): Promise<WorkSession[]> {
  const pageSize = 1000;
  const result: WorkSession[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
      include_images: 'false',
      started_before: new Date(to).toISOString(),
      ended_after: new Date(from).toISOString(),
    });
    const page = await api.get<WorkSession[]>(`/sessions?${params.toString()}`);
    const uniquePage = page.filter((session) => {
      if (seen.has(session.id)) return false;
      seen.add(session.id);
      return true;
    });
    result.push(...uniquePage);
    if (page.length < pageSize || uniquePage.length < page.length) return result;
  }
}

function formatHours(minutes: number): string {
  const hours = Math.max(0, minutes) / 60;
  return `${hours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h`;
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}

function formatRevenue(values: Record<string, number>): string {
  const entries = Object.entries(values).filter(([, value]) => value !== 0);
  if (entries.length === 0) return '—';
  return entries.map(([currency, value]) => formatMoney(value, currency)).join(' · ');
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClasses(status: string): string {
  if (status === 'active') return 'border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent';
  if (status === 'online_free' || status === 'assigned') return 'border-blue-400/30 bg-blue-400/10 text-blue-300';
  if (status === 'idle') return 'border-gold-accent/30 bg-gold-accent/10 text-gold-accent';
  if (status === 'maintenance') return 'border-purple-400/30 bg-purple-400/10 text-purple-300';
  if (status === 'unhealthy') return 'border-danger/30 bg-danger/10 text-danger';
  return 'border-white/10 bg-white/[0.04] text-theme-muted';
}

function formatHealthCheck(value?: string | null): string {
  if (!value) return 'No health check';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No health check';
  return date.toLocaleString();
}

function ChartPanel({ title, subtitle, titleTooltip, children, className = '' }: {
  title: string;
  subtitle?: string;
  titleTooltip?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-panel overflow-hidden ${className}`}>
      <div className="border-b border-theme px-5 py-4">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-black text-theme-heading">{title}</h2>
          {titleTooltip && (
            <span
              title={titleTooltip}
              className="inline-flex cursor-help text-theme-muted hover:text-theme-heading"
              aria-label={titleTooltip}
            >
              <Info size={14} />
            </span>
          )}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-theme-muted">{subtitle}</p>}
      </div>
      <div className="h-[310px] p-4">{children}</div>
    </section>
  );
}

function MiniStat({ label, value, accent = 'text-theme-heading' }: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-theme bg-white/[0.025] px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-theme-muted">{label}</p>
      <p className={`mt-1 text-sm font-black tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}

export default function UtilizationDashboardPage() {
  const [machines, setMachines] = useState<RdpResource[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [lineItems, setLineItems] = useState<PayrollLineItem[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [range, setRange] = useState<RangeDays>(7);
  const [rangeMode, setRangeMode] = useState<RangeMode>(7);
  const [customFrom, setCustomFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return dayKey(date);
  });
  const [customTo, setCustomTo] = useState(() => dayKey(new Date()));
  const [analyticsView, setAnalyticsView] = useState<AnalyticsView>('cards');
  const [detail, setDetail] = useState<MachineMetric | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const requestedAt = Date.now();
      const customIsValid = rangeMode === 'custom' && customFrom && customTo && customFrom <= customTo;
      const requestedDays = customIsValid
        ? createCustomDayBuckets(customFrom, customTo)
        : createDayBuckets(range, requestedAt);
      const requestedFrom = requestedDays[0]?.start ?? requestedAt;
      const requestedTo = customIsValid && requestedDays.length > 0
        ? Math.min(requestedDays[requestedDays.length - 1].end, requestedAt)
        : requestedAt;
      const results = await Promise.allSettled([
        api.get<RdpResource[]>('/rdp'),
        fetchSessionsInWindow(requestedFrom, requestedTo),
        api.get<Worker[]>('/workers'),
        api.get<Shift[]>('/shifts'),
        api.get<PayrollLineItem[]>('/payroll/line-items'),
        api.get<PayrollPeriod[]>('/payroll/periods'),
      ] as const);

      if (results[0].status === 'rejected') throw results[0].reason;
      setMachines(results[0].value);

      const nextWarnings: string[] = [];
      if (results[1].status === 'fulfilled') setSessions(results[1].value);
      else { setSessions([]); nextWarnings.push('session history'); }
      if (results[2].status === 'fulfilled') setWorkers(results[2].value);
      else { setWorkers([]); nextWarnings.push('workers'); }
      if (results[3].status === 'fulfilled') setShifts(results[3].value);
      else { setShifts([]); nextWarnings.push('shift assignments'); }
      if (results[4].status === 'fulfilled') setLineItems(results[4].value);
      else { setLineItems([]); nextWarnings.push('payroll earnings'); }
      if (results[5].status === 'fulfilled') setPeriods(results[5].value);
      else { setPeriods([]); nextWarnings.push('payroll currencies'); }
      setWarnings(nextWarnings);
      setNow(Date.now());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load the RDP fleet');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customFrom, customTo, range, rangeMode]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const customDateError = rangeMode === 'custom'
    ? (!customFrom || !customTo
      ? 'Choose both a From and To date.'
      : customFrom > customTo
        ? 'The From date must be on or before the To date.'
        : null)
    : null;
  const days = useMemo(
    () => rangeMode === 'custom' && !customDateError
      ? createCustomDayBuckets(customFrom, customTo)
      : createDayBuckets(range, now),
    [customDateError, customFrom, customTo, now, range, rangeMode],
  );
  const windowStart = days[0]?.start ?? now;
  const windowEnd = rangeMode === 'custom' && days.length > 0
    ? Math.min(days[days.length - 1].end, now)
    : now;
  const rangeDayCount = Math.max(1, days.length);
  const rangeLabel = rangeMode === 'custom' && !customDateError
    ? `${new Date(`${customFrom}T00:00:00`).toLocaleDateString()} – ${new Date(`${customTo}T00:00:00`).toLocaleDateString()}`
    : `${range} days`;

  const workerMap = useMemo(() => new Map(workers.map((worker) => [worker.id, worker])), [workers]);
  const periodCurrency = useMemo(
    () => new Map(periods.map((period) => [period.id, period.currency || 'USD'])),
    [periods],
  );

  const liveMachineIds = useMemo(() => new Set(
    sessions
      .filter((session) => !session.end_time && session.rdp_resource_id)
      .map((session) => String(session.rdp_resource_id)),
  ), [sessions]);

  const relevantSessions = useMemo(() => sessions.filter((session) => {
    if (!session.rdp_resource_id) return false;
    const start = new Date(session.start_time).getTime();
    const end = session.end_time ? new Date(session.end_time).getTime() : windowEnd;
    return Number.isFinite(start) && Number.isFinite(end) && end >= windowStart && start <= windowEnd;
  }), [sessions, windowEnd, windowStart]);

  const sessionsByMachine = useMemo(() => {
    const result = new Map<string, WorkSession[]>();
    for (const session of relevantSessions) {
      if (!session.rdp_resource_id) continue;
      const current = result.get(session.rdp_resource_id) ?? [];
      current.push(session);
      result.set(session.rdp_resource_id, current);
    }
    return result;
  }, [relevantSessions]);

  const sessionById = useMemo(
    () => new Map(relevantSessions.map((session) => [session.id, session])),
    [relevantSessions],
  );

  const revenueByMachine = useMemo(() => {
    const result = new Map<string, Record<string, number>>();
    for (const item of lineItems) {
      const session = sessionById.get(item.session_id);
      if (!session?.rdp_resource_id) continue;
      const currency = periodCurrency.get(item.payroll_period_id) ?? 'USD';
      const amount = Number(item.gross_amount);
      if (!Number.isFinite(amount)) continue;
      const values = result.get(session.rdp_resource_id) ?? {};
      values[currency] = (values[currency] ?? 0) + amount;
      result.set(session.rdp_resource_id, values);
    }
    return result;
  }, [lineItems, periodCurrency, sessionById]);

  const machineMetrics = useMemo<MachineMetric[]>(() => machines.map((machine) => {
    const machineSessions = sessionsByMachine.get(machine.id) ?? [];
    const workerIds = new Set<string>();

    for (const session of machineSessions) {
      workerIds.add(session.worker_id);
    }
    for (const shift of shifts) {
      if (shift.rdp_resource_id !== machine.id || SHIFT_EXCLUDED.has(shift.status)) continue;
      const start = new Date(shift.scheduled_start).getTime();
      const end = new Date(shift.scheduled_end).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end >= windowStart && start <= windowEnd) {
        workerIds.add(shift.worker_id);
      }
    }
    if (machine.assigned_worker_id) workerIds.add(machine.assigned_worker_id);

    const rdpMinutes = sessionMinutes(machineSessions, 'start_time', 'end_time', windowStart, windowEnd);
    const workMinutes = sessionMinutes(machineSessions, 'image_start_at', 'image_end_at', windowStart, windowEnd);
    const idleMinutes = Math.max(0, rdpMinutes - workMinutes);
    const capacityMinutes = Math.max(0, (windowEnd - windowStart) / 60_000);
    const live = liveMachineIds.has(machine.id) || machine.status === 'active';
    return {
      machine,
      live,
      healthy: HEALTHY.has(machine.status),
      sessionCount: machineSessions.length,
      workerIds: Array.from(workerIds),
      workerNames: Array.from(workerIds).map((id) => workerMap.get(id)?.display_name ?? `${id.slice(0, 8)}…`),
      rdpMinutes,
      workMinutes,
      idleMinutes,
      connectedRate: capacityMinutes > 0 ? Math.min(100, (rdpMinutes / capacityMinutes) * 100) : 0,
      workCoverage: rdpMinutes > 0 ? Math.min(100, (workMinutes / rdpMinutes) * 100) : 0,
      revenueByCurrency: revenueByMachine.get(machine.id) ?? {},
    };
  }).sort((a, b) => Number(b.live) - Number(a.live) || b.rdpMinutes - a.rdpMinutes || a.machine.nickname.localeCompare(b.machine.nickname)), [
    liveMachineIds,
    machines,
    revenueByMachine,
    sessionsByMachine,
    shifts,
    windowEnd,
    windowStart,
    workerMap,
  ]);

  const stats = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const attached = new Set<string>();
    const revenue: Record<string, number> = {};
    let rdpMinutes = 0;
    let workMinutes = 0;
    for (const metric of machineMetrics) {
      const status = metric.live ? 'active' : metric.machine.status;
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      metric.workerIds.forEach((workerId) => attached.add(workerId));
      rdpMinutes += metric.rdpMinutes;
      workMinutes += metric.workMinutes;
      Object.entries(metric.revenueByCurrency).forEach(([currency, amount]) => {
        revenue[currency] = (revenue[currency] ?? 0) + amount;
      });
    }
    const up = machineMetrics.filter((metric) => ONLINE.has(metric.live ? 'active' : metric.machine.status)).length;
    const live = machineMetrics.filter((metric) => metric.live).length;
    const free = statusCounts.online_free ?? 0;
    const maintenance = statusCounts.maintenance ?? 0;
    const unhealthy = statusCounts.unhealthy ?? 0;
    const offline = statusCounts.offline ?? 0;
    const locked = statusCounts.admin_locked ?? 0;
    return {
      statusCounts,
      attachedWorkers: attached.size,
      revenue,
      rdpMinutes,
      workMinutes,
      idleMinutes: Math.max(0, rdpMinutes - workMinutes),
      up,
      live,
      free,
      maintenance,
      unhealthy,
      offline,
      locked,
      availability: machines.length ? (up / machines.length) * 100 : 0,
      workCoverage: rdpMinutes ? (workMinutes / rdpMinutes) * 100 : 0,
    };
  }, [machineMetrics, machines]);

  const daily = useMemo(() => {
    return days.map((day) => {
      const bucketEnd = Math.min(day.end, windowEnd);
      let rdpMinutes = 0;
      let workMinutes = 0;
      sessionsByMachine.forEach((machineSessions) => {
        rdpMinutes += sessionMinutes(machineSessions, 'start_time', 'end_time', day.start, bucketEnd);
        workMinutes += sessionMinutes(machineSessions, 'image_start_at', 'image_end_at', day.start, bucketEnd);
      });
      const elapsedMinutes = Math.max(0, (bucketEnd - day.start) / 60_000);
      return {
        ...day,
        rdpMinutes,
        workMinutes,
        idleMinutes: Math.max(0, rdpMinutes - workMinutes),
        connectedRate: machines.length && elapsedMinutes > 0
          ? Math.min(100, (rdpMinutes / (machines.length * elapsedMinutes)) * 100)
          : 0,
      };
    });
  }, [days, machines.length, sessionsByMachine, windowEnd]);

  const statusChartData = useMemo<ChartData<'doughnut'>>(() => {
    const statuses = STATUS_ORDER.filter((status) => (stats.statusCounts[status] ?? 0) > 0);
    return {
      labels: statuses.map(statusLabel),
      datasets: [{
        data: statuses.map((status) => stats.statusCounts[status] ?? 0),
        backgroundColor: statuses.map((status) => STATUS_COLORS[status] ?? '#94A3B8'),
        borderColor: 'rgba(2, 6, 23, 0.8)',
        borderWidth: 3,
      }],
    };
  }, [stats.statusCounts]);

  const hoursChartData = useMemo<ChartData<'bar'>>(() => ({
    labels: ['RDP uptime', 'Work hours', 'Idle difference'],
    datasets: [{
      label: 'Hours',
      data: [stats.rdpMinutes, stats.workMinutes, stats.idleMinutes].map((minutes) => Number((minutes / 60).toFixed(2))),
      backgroundColor: [BLUE, EMERALD, GOLD],
      borderRadius: 10,
      borderSkipped: false,
    }],
  }), [stats.idleMinutes, stats.rdpMinutes, stats.workMinutes]);

  const revenueChartData = useMemo<ChartData<'bar'>>(() => {
    const currencies = Array.from(new Set(machineMetrics.flatMap((metric) => Object.keys(metric.revenueByCurrency))));
    const colors = [EMERALD, GOLD, BLUE, PURPLE, CYAN, RED];
    return {
      labels: machineMetrics.map((metric) => metric.machine.nickname),
      datasets: currencies.map((currency, index) => ({
        label: `Gross ${currency}`,
        data: machineMetrics.map((metric) => metric.revenueByCurrency[currency] ?? 0),
        backgroundColor: colors[index % colors.length],
        borderRadius: 7,
        borderSkipped: false,
      })),
    };
  }, [machineMetrics]);

  const workerChartData = useMemo<ChartData<'bar'>>(() => ({
    labels: machineMetrics.map((metric) => metric.machine.nickname),
    datasets: [
      {
        label: 'Attached workers',
        data: machineMetrics.map((metric) => metric.workerIds.length),
        backgroundColor: PURPLE,
        borderRadius: 7,
        borderSkipped: false,
      },
      {
        label: 'Sessions',
        data: machineMetrics.map((metric) => metric.sessionCount),
        backgroundColor: BLUE,
        borderRadius: 7,
        borderSkipped: false,
      },
    ],
  }), [machineMetrics]);

  const dailyHoursData = useMemo<ChartData<'line'>>(() => ({
    labels: daily.map((day) => day.label),
    datasets: [
      {
        label: 'RDP uptime',
        data: daily.map((day) => Number((day.rdpMinutes / 60).toFixed(2))),
        borderColor: BLUE,
        backgroundColor: 'rgba(96, 165, 250, 0.12)',
        pointBackgroundColor: BLUE,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
      },
      {
        label: 'Work hours',
        data: daily.map((day) => Number((day.workMinutes / 60).toFixed(2))),
        borderColor: EMERALD,
        backgroundColor: 'rgba(63, 199, 160, 0.08)',
        pointBackgroundColor: EMERALD,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
      },
      {
        label: 'Idle difference',
        data: daily.map((day) => Number((day.idleMinutes / 60).toFixed(2))),
        borderColor: GOLD,
        pointBackgroundColor: GOLD,
        borderDash: [6, 5],
        borderWidth: 2,
        tension: 0.35,
      },
    ],
  }), [daily]);

  const dailyRateData = useMemo<ChartData<'line'>>(() => ({
    labels: daily.map((day) => day.label),
    datasets: [{
      label: 'Connected utilization',
      data: daily.map((day) => Number(day.connectedRate.toFixed(2))),
      borderColor: PURPLE,
      backgroundColor: 'rgba(167, 139, 250, 0.14)',
      pointBackgroundColor: PURPLE,
      pointRadius: rangeDayCount <= 7 ? 4 : 2,
      borderWidth: 2,
      tension: 0.35,
      fill: true,
    }],
  }), [daily, rangeDayCount]);

  const rateChartOptions = useMemo<ChartOptions<'line'>>(() => ({
    ...lineChartOptions,
    scales: {
      ...lineChartOptions.scales,
      y: {
        beginAtZero: true,
        suggestedMax: 100,
        grid: { color: GRID },
        ticks: { color: TICK, callback: (value) => `${value}%` },
      },
    },
  }), []);

  if (loading) {
    return <div className="flex justify-center py-20"><SpinningDots size="lg" className="text-emerald-accent" /></div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <DataAlert tone="error">{error}</DataAlert>
        <button type="button" className="btn-secondary" onClick={() => void load()}>Try again</button>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="RDP Fleet Intelligence"
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="relative">
              <span className="sr-only">Reporting range</span>
              <CalendarRange size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
              <select
                value={String(rangeMode)}
                onChange={(event) => {
                  if (event.target.value === 'custom') {
                    setRangeMode('custom');
                    return;
                  }
                  const nextRange = Number(event.target.value) as RangeDays;
                  setRange(nextRange);
                  setRangeMode(nextRange);
                }}
                className="input-field min-w-[154px] py-2 pl-9 pr-8 text-xs font-bold"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="custom">Custom dates</option>
              </select>
            </label>
            <AnalyticsViewToggle value={analyticsView} onChange={setAnalyticsView} />
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        )}
      />

      {rangeMode === 'custom' && (
        <div className="glass-panel mb-5 flex flex-wrap items-end gap-3 border-emerald-accent/20 px-4 py-3">
          <div className="mr-auto">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-accent">Custom reporting period</p>
            <p className="mt-1 text-xs text-theme-muted">All cards, charts, earnings and machine totals use these inclusive dates.</p>
          </div>
          <label className="min-w-[150px]">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-theme-muted">From</span>
            <input type="date" value={customFrom} max={customTo || dayKey(now)} onChange={(event) => setCustomFrom(event.target.value)} className="input-field w-full text-xs" />
          </label>
          <label className="min-w-[150px]">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-theme-muted">To</span>
            <input type="date" value={customTo} min={customFrom || undefined} max={dayKey(now)} onChange={(event) => setCustomTo(event.target.value)} className="input-field w-full text-xs" />
          </label>
          {customDateError && <p className="w-full text-xs font-semibold text-danger">{customDateError}</p>}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-5">
          <DataAlert tone="warning">
            Some supporting data could not be loaded: {warnings.join(', ')}. Available fleet metrics are still shown.
          </DataAlert>
        </div>
      )}

      {machines.length === 0 ? (
        <DataAlert>No RDP resources are configured. Add machines under RDP Resources to populate this dashboard.</DataAlert>
      ) : (
        <>
          <section className="mb-8">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-theme-heading">{rangeLabel}</h2>
              </div>
              <p className="hidden text-xs text-theme-muted sm:block">
                Updated {new Date(now).toLocaleTimeString()}
              </p>
            </div>

            {analyticsView === 'cards' ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <KpiCard compact label="Total RDPs" value={machines.length} icon={Server} accent="blue" highlight />
                <KpiCard compact label="Healthy now" value={stats.up} change={`${stats.availability.toFixed(1)}%`} icon={HeartPulse} />
                <KpiCard compact label="In use now" value={stats.live} icon={Zap} />
                <KpiCard compact label="Free now" value={stats.free} icon={Clock3} accent="gold" />
                <KpiCard compact label="Maintenance now" value={stats.maintenance} icon={Wrench} accent={stats.maintenance ? 'danger' : 'blue'} />
                <KpiCard compact label="Offline / locked" value={stats.unhealthy + stats.offline + stats.locked} icon={ShieldAlert} accent={(stats.unhealthy + stats.offline + stats.locked) ? 'danger' : 'emerald'} />
                <KpiCard compact label="RDP uptime" value={formatHours(stats.rdpMinutes)} icon={Activity} accent="blue" />
                <KpiCard compact label="Work hours" value={formatHours(stats.workMinutes)} change={`${stats.workCoverage.toFixed(1)}%`} icon={Clock3} />
                <KpiCard compact label="Idle difference" value={formatHours(stats.idleMinutes)} icon={TimerOff} accent="gold" />
                <KpiCard compact label="Attached workers" value={stats.attachedWorkers} icon={Users} accent="blue" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ChartPanel title="All RDP statuses" subtitle={`${machines.length} machines across every current status`}>
                  <Doughnut
                    data={statusChartData}
                    options={doughnutChartOptions}
                  />
                </ChartPanel>
                <ChartPanel title="Time composition" subtitle={`RDP uptime versus entered work time · ${rangeLabel}`}>
                  <Bar data={hoursChartData} options={{ ...baseChartOptions, plugins: { ...baseChartOptions.plugins, legend: { display: false } } }} />
                </ChartPanel>
                <ChartPanel title="Gross earnings by RDP" subtitle="Recorded payroll gross tied to each machine's sessions">
                  {revenueChartData.datasets.length === 0 ? (
                    <div className="flex h-full items-center"><DataAlert>No payroll earnings are linked to RDP sessions in this range.</DataAlert></div>
                  ) : (
                    <Bar data={revenueChartData} options={baseChartOptions} />
                  )}
                </ChartPanel>
                <ChartPanel title="Worker and session coverage" subtitle="Unique attached workers compared with completed and live sessions">
                  <Bar data={workerChartData} options={baseChartOptions} />
                </ChartPanel>
              </div>
            )}
          </section>

          <section className="mb-8">
            <div className="mb-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-300">Time intelligence</p>
              <h2 className="mt-1 text-lg font-black text-theme-heading">Daily uptime and work-rate trends</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <ChartPanel
                title="RDP uptime vs work hours"
                subtitle="Worker-entered work time is compared with the time each RDP connection was on"
                className="xl:col-span-2"
              >
                <Line data={dailyHoursData} options={lineChartOptions} />
              </ChartPanel>
              <ChartPanel
                title="Daily connected rate"
                titleTooltip="How much of your fleet was in use each day — total RDP connection time divided by (number of machines × hours in that day). 100% means every machine was connected the whole day."
              >
                <Line data={dailyRateData} options={rateChartOptions} />
              </ChartPanel>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {daily.slice(-7).map((day) => (
                <div key={day.key} className="glass-panel px-3 py-3">
                  <p className="truncate text-[10px] font-black uppercase tracking-wider text-theme-muted" title={day.longLabel}>
                    {day.longLabel}
                  </p>
                  <p className="mt-2 text-lg font-black text-theme-heading">{formatHours(day.rdpMinutes)}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-emerald-accent"
                      style={{ width: `${day.rdpMinutes ? Math.min(100, (day.workMinutes / day.rdpMinutes) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-theme-muted">Work {formatHours(day.workMinutes)}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-lg font-black text-theme-heading">Machine detail</h2>
            </div>

            <div className="glass-panel overflow-x-auto">
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-theme bg-white/[0.025]">
                    {['RDP', 'Status / health', 'Current worker', 'Attached workers', 'Sessions', 'RDP uptime', 'Work hours', 'Idle difference', 'Connected rate', 'Recorded gross', ''].map((header) => (
                      <th key={header || 'actions'} className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-theme-muted">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {machineMetrics.map((metric) => {
                    const currentWorker = metric.machine.assigned_worker_name
                      ?? (metric.machine.assigned_worker_id ? workerMap.get(metric.machine.assigned_worker_id)?.display_name : null)
                      ?? '—';
                    return (
                      <tr key={metric.machine.id} className="border-b border-theme/70 last:border-0 hover:bg-white/[0.025]">
                        <td className="px-4 py-3">
                          <p className="font-bold text-theme-heading">{metric.machine.nickname}</p>
                          <p className="mt-0.5 text-[10px] text-theme-muted">{metric.machine.country ?? 'No country'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClasses(metric.live ? 'active' : metric.machine.status)}`}>
                            {metric.live ? 'Live' : statusLabel(metric.machine.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-theme-heading">{currentWorker}</td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-theme-heading">{metric.workerIds.length}</p>
                          <p className="mt-0.5 max-w-[220px] truncate text-[10px] text-theme-muted" title={metric.workerNames.join(', ')}>{metric.workerNames.join(', ') || '—'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-theme-heading">{metric.sessionCount}</td>
                        <td className="px-4 py-3 font-mono font-bold text-blue-300">{formatHours(metric.rdpMinutes)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-accent">{formatHours(metric.workMinutes)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-gold-accent">{formatHours(metric.idleMinutes)}</td>
                        <td className="px-4 py-3 font-mono text-theme-heading">{metric.connectedRate.toFixed(1)}%</td>
                        <td className="px-4 py-3 font-semibold text-theme-heading">{formatRevenue(metric.revenueByCurrency)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setDetail(metric)}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading"
                            style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}
                            title="View RDP details"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}
        >
          <div className="w-full max-w-2xl glass-panel overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-theme px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${detail.live ? 'animate-pulse bg-emerald-accent' : detail.healthy ? 'bg-blue-400' : 'bg-danger'}`} />
                  <h3 className="truncate text-base font-black text-theme-heading">{detail.machine.nickname}</h3>
                </div>
                <p className="mt-1 truncate text-xs text-theme-muted">
                  {[detail.machine.client_name ?? detail.machine.client_group, detail.machine.country].filter(Boolean).join(' · ') || 'No client or location set'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusClasses(detail.live ? 'active' : detail.machine.status)}`}>
                  {detail.live ? 'Live' : statusLabel(detail.machine.status)}
                </span>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat label="RDP uptime" value={formatHours(detail.rdpMinutes)} accent="text-blue-300" />
                <MiniStat label="Work hours" value={formatHours(detail.workMinutes)} accent="text-emerald-accent" />
                <MiniStat label="Idle difference" value={formatHours(detail.idleMinutes)} accent="text-gold-accent" />
                <MiniStat label="Connected rate" value={`${detail.connectedRate.toFixed(1)}%`} />
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                  <span>Work coverage of RDP time</span>
                  <span className="text-theme-heading">{detail.workCoverage.toFixed(1)}%</span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="bg-emerald-accent" style={{ width: `${detail.workCoverage}%` }} title="Work hours" />
                  <div className="bg-gold-accent/70" style={{ width: `${Math.max(0, 100 - detail.workCoverage)}%` }} title="Idle difference" />
                </div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-theme-muted">Workers attached ({detail.workerIds.length})</p>
                  <p className="mt-1.5 text-sm font-semibold text-theme-heading">{detail.workerNames.length ? detail.workerNames.join(', ') : 'No workers in this range'}</p>
                  <p className="mt-1 text-xs text-theme-muted">
                    Current worker: {detail.machine.assigned_worker_name
                      ?? (detail.machine.assigned_worker_id ? workerMap.get(detail.machine.assigned_worker_id)?.display_name : null)
                      ?? 'None'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-theme-muted">Recorded gross made</p>
                  <p className="mt-1.5 text-sm font-black text-emerald-accent">{formatRevenue(detail.revenueByCurrency)}</p>
                  <p className="mt-1 text-xs text-theme-muted">{detail.sessionCount} session{detail.sessionCount === 1 ? '' : 's'} in range</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-theme pt-3 text-[10px] text-theme-muted">
                <span>Health: {detail.healthy ? 'Healthy / reachable' : statusLabel(detail.machine.status)}</span>
                <span>{formatHealthCheck(detail.machine.last_health_check_at)}</span>
                {!!detail.machine.risk_flags?.length && (
                  <span className="font-bold text-danger">{detail.machine.risk_flags.length} risk flag(s)</span>
                )}
              </div>
              {detail.machine.health_notes && (
                <p className="mt-2 rounded-lg border border-theme bg-black/10 px-3 py-2 text-xs text-theme-muted">
                  {detail.machine.health_notes}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
