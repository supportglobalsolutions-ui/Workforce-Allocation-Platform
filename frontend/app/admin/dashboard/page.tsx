'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Bar, Doughnut, Line, PolarArea, Radar } from 'react-chartjs-2';
import {
  Activity, AlertTriangle, DollarSign, Server, TrendingUp, Users,
} from 'lucide-react';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
);

// ── Types ──────────────────────────────────────────────────────────────────────

interface Worker {
  id: string;
  status: string;
  pay_tier?: string;
  country?: string;
}

interface WorkSession {
  id: string;
  end_time: string | null;
  start_time: string;
  session_type: string;
  duration_minutes: number | null;
}

interface RDPResource {
  id: string;
  status: string;
}

interface QualityScore {
  composite_score: number;
  assessment_component: number | null;
  rating_component: number | null;
  reliability_component: number | null;
  consistency_component: number | null;
  period_type?: string | null;
  period_label?: string | null;
}

interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  created_at: string;
}

interface PayrollLineItem {
  id: string;
  exception_flags: unknown[];
}

interface PayrollPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
}

// ── Theme helpers ──────────────────────────────────────────────────────────────

const EMERALD = '#3FC7A0';
const GOLD = '#D4AF37';
const BLUE = '#60A5FA';
const RED = '#F87171';
const PURPLE = '#A78BFA';
const MUTED = 'rgba(148, 163, 184, 0.85)';
const GRID = 'rgba(255, 255, 255, 0.06)';

const PALETTE = [EMERALD, GOLD, BLUE, PURPLE, RED, '#34D399', '#FBBF24', '#38BDF8'];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function coversToday(p: PayrollPeriod, today: string): boolean {
  const s = p.start_date.slice(0, 10);
  const e = p.end_date.slice(0, 10);
  return s <= today && today <= e;
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = keyFn(item) || 'unknown';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function labelStatus(s: string): string {
  return s.replace(/_/g, ' ');
}

const baseOptions: ChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: MUTED,
        boxWidth: 10,
        boxHeight: 10,
        padding: 12,
        font: { size: 11 },
      },
    },
    tooltip: {
      backgroundColor: 'rgba(8, 12, 22, 0.95)',
      titleColor: '#fff',
      bodyColor: MUTED,
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      padding: 10,
    },
  },
};

const cartesianOptions: ChartOptions<'bar' | 'line'> = {
  ...baseOptions,
  scales: {
    x: {
      ticks: { color: MUTED, font: { size: 10 }, maxRotation: 0 },
      grid: { color: GRID },
      border: { color: GRID },
    },
    y: {
      beginAtZero: true,
      ticks: { color: MUTED, font: { size: 10 }, precision: 0 },
      grid: { color: GRID },
      border: { color: GRID },
    },
  },
};

function ChartPanel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-panel rounded-2xl border border-white/10 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h2 className="text-sm font-bold text-theme-heading">{title}</h2>
        {subtitle && <p className="text-[11px] text-theme-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4 h-[260px]">{children}</div>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { session } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [scores, setScores] = useState<QualityScore[]>([]);
  const [lineItems, setLineItems] = useState<PayrollLineItem[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    api.get<{ username: string | null }>('/workers/me')
      .then((w) => setUsername(w.username))
      .catch(() => {});

    Promise.all([
      api.get<Worker[]>('/workers'),
      api.get<WorkSession[]>('/sessions?limit=1000&include_images=false'),
      api.get<RDPResource[]>('/rdp'),
      api.get<QualityScore[]>('/quality/scores'),
      api.get<PayrollLineItem[]>('/payroll/line-items'),
      api.get<PayrollPeriod[]>('/payroll/periods'),
      api.get<AuditLog[]>('/audit?limit=10'),
    ])
      .then(([w, s, m, q, items, per, logs]) => {
        setWorkers(w);
        setSessions(s);
        setMachines(m);
        setScores(q);
        setLineItems(items);
        setPeriods(per);
        setAuditLogs(logs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const today = useMemo(() => isoDay(new Date()), []);

  const currentPeriod = useMemo(() => {
    const sorted = [...periods].sort(
      (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
    );
    return sorted.find((p) => coversToday(p, today)) ?? sorted[0] ?? null;
  }, [periods, today]);

  const workersOnline = workers.filter((w) => w.status === 'active').length;
  const activeSessions = sessions.filter((s) => !s.end_time).length;
  const machinesOnline = machines.filter((m) => !['offline', 'maintenance'].includes(m.status)).length;
  const exceptions = lineItems.filter((i) => (i.exception_flags?.length ?? 0) > 0).length;
  const payrollPending = periods.filter((p) => ['open', 'calculated', 'approved'].includes(p.status)).length;

  const qualityAvg = useMemo(() => {
    if (scores.length === 0) return null;
    return scores.reduce((sum, s) => sum + Number(s.composite_score), 0) / scores.length;
  }, [scores]);

  const periodSessions = useMemo(() => {
    if (!currentPeriod) return sessions;
    const start = currentPeriod.start_date.slice(0, 10);
    const end = currentPeriod.end_date.slice(0, 10);
    return sessions.filter((s) => {
      const d = s.start_time.slice(0, 10);
      return d >= start && d <= end;
    });
  }, [sessions, currentPeriod]);

  // ── Chart data ───────────────────────────────────────────────────────────────

  const kpiBarData: ChartData<'bar'> = useMemo(() => ({
    labels: ['Workers', 'Sessions', 'Machines', 'Quality %', 'Exceptions', 'Payroll'],
    datasets: [{
      label: 'Live snapshot',
      data: [
        workersOnline,
        activeSessions,
        machinesOnline,
        qualityAvg ?? 0,
        exceptions,
        payrollPending,
      ],
      backgroundColor: [EMERALD, BLUE, PURPLE, GOLD, RED, '#FBBF24'],
      borderRadius: 8,
      borderSkipped: false,
      maxBarThickness: 36,
    }],
  }), [workersOnline, activeSessions, machinesOnline, qualityAvg, exceptions, payrollPending]);

  const workersDoughnut: ChartData<'doughnut'> = useMemo(() => {
    const counts = countBy(workers, (w) => w.status);
    const labels = Object.keys(counts);
    return {
      labels: labels.map(labelStatus),
      datasets: [{
        data: labels.map((k) => counts[k]),
        backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 0,
        hoverOffset: 6,
      }],
    };
  }, [workers]);

  const machinesPolar: ChartData<'polarArea'> = useMemo(() => {
    const counts = countBy(machines, (m) => m.status);
    const labels = Object.keys(counts);
    return {
      labels: labels.map(labelStatus),
      datasets: [{
        data: labels.map((k) => counts[k]),
        backgroundColor: labels.map((_, i) => `${PALETTE[i % PALETTE.length]}CC`),
        borderWidth: 0,
      }],
    };
  }, [machines]);

  const sessionsLine: ChartData<'line'> = useMemo(() => {
    const days: string[] = [];
    const counts: number[] = [];
    const hours: number[] = [];

    if (currentPeriod) {
      const start = new Date(currentPeriod.start_date.slice(0, 10) + 'T12:00:00');
      const end = new Date(currentPeriod.end_date.slice(0, 10) + 'T12:00:00');
      // Cap chart width for very long ranges
      const maxDays = 45;
      const span = Math.min(
        Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
        maxDays,
      );
      for (let i = 0; i < span; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        if (d > end) break;
        days.push(isoDay(d));
      }
    } else {
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(isoDay(d));
      }
    }

    for (const day of days) {
      const daySessions = periodSessions.filter((s) => s.start_time.slice(0, 10) === day);
      counts.push(daySessions.length);
      hours.push(
        Math.round(
          daySessions.reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0) / 60 * 10,
        ) / 10,
      );
    }

    const shortLabels = days.map((d) => {
      const [, m, day] = d.split('-');
      return `${Number(m)}/${Number(day)}`;
    });

    return {
      labels: shortLabels,
      datasets: [
        {
          label: 'Sessions started',
          data: counts,
          borderColor: EMERALD,
          backgroundColor: 'rgba(63, 199, 160, 0.15)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: EMERALD,
          yAxisID: 'y',
        },
        {
          label: 'Hours logged',
          data: hours,
          borderColor: GOLD,
          backgroundColor: 'transparent',
          tension: 0.35,
          pointRadius: 2,
          pointBackgroundColor: GOLD,
          borderDash: [4, 4],
          yAxisID: 'y1',
        },
      ],
    };
  }, [periodSessions, currentPeriod]);

  const sessionsLineOptions: ChartOptions<'line'> = useMemo(() => ({
    ...cartesianOptions,
    scales: {
      x: cartesianOptions.scales?.x,
      y: {
        ...cartesianOptions.scales?.y,
        title: { display: true, text: 'Sessions', color: MUTED, font: { size: 10 } },
      },
      y1: {
        position: 'right',
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        ticks: { color: MUTED, font: { size: 10 } },
        border: { color: GRID },
        title: { display: true, text: 'Hours', color: MUTED, font: { size: 10 } },
      },
    },
  }), []);

  const sessionTypesDoughnut: ChartData<'doughnut'> = useMemo(() => {
    const source = periodSessions.length ? periodSessions : sessions;
    const counts = countBy(source, (s) => s.session_type);
    const labels = Object.keys(counts);
    return {
      labels: labels.map(labelStatus),
      datasets: [{
        data: labels.map((k) => counts[k]),
        backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 0,
      }],
    };
  }, [periodSessions, sessions]);

  const qualityRadar: ChartData<'radar'> = useMemo(() => {
    if (scores.length === 0) {
      return {
        labels: ['Assessments', 'Admin ratings', 'Reliability', 'Consistency'],
        datasets: [{ label: 'Avg', data: [0, 0, 0, 0], borderColor: EMERALD, backgroundColor: 'rgba(63,199,160,0.2)' }],
      };
    }
    const avg = (key: keyof QualityScore) =>
      scores.reduce((sum, s) => sum + Number(s[key] ?? 0), 0) / scores.length;
    return {
      labels: ['Assessments', 'Admin ratings', 'Reliability', 'Consistency'],
      datasets: [{
        label: 'Avg component',
        data: [
          avg('assessment_component'),
          avg('rating_component'),
          avg('reliability_component'),
          avg('consistency_component'),
        ],
        borderColor: EMERALD,
        backgroundColor: 'rgba(63, 199, 160, 0.2)',
        pointBackgroundColor: GOLD,
        pointBorderColor: GOLD,
        borderWidth: 2,
      }],
    };
  }, [scores]);

  const qualityRadarOptions: ChartOptions<'radar'> = {
    ...baseOptions,
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        ticks: { display: false },
        grid: { color: GRID },
        angleLines: { color: GRID },
        pointLabels: { color: MUTED, font: { size: 11 } },
      },
    },
  };

  const qualityBars: ChartData<'bar'> = useMemo(() => {
    const buckets = [
      { label: '0–20', min: 0, max: 20 },
      { label: '21–40', min: 21, max: 40 },
      { label: '41–60', min: 41, max: 60 },
      { label: '61–80', min: 61, max: 80 },
      { label: '81–100', min: 81, max: 100 },
    ];
    const data = buckets.map(
      (b) => scores.filter((s) => {
        const v = Number(s.composite_score);
        return v >= b.min && v <= b.max;
      }).length,
    );
    return {
      labels: buckets.map((b) => b.label),
      datasets: [{
        label: 'Workers',
        data,
        backgroundColor: EMERALD,
        borderRadius: 6,
        maxBarThickness: 40,
      }],
    };
  }, [scores]);

  const payrollBars: ChartData<'bar'> = useMemo(() => {
    const counts = countBy(periods, (p) => p.status);
    const order = ['open', 'calculated', 'approved', 'paid'];
    const labels = order.filter((k) => counts[k] != null || periods.length === 0);
    const keys = labels.length ? labels : order;
    return {
      labels: keys.map(labelStatus),
      datasets: [{
        label: 'Work periods',
        data: keys.map((k) => counts[k] ?? 0),
        backgroundColor: [BLUE, GOLD, EMERALD, '#FBBF24'],
        borderRadius: 8,
        maxBarThickness: 44,
      }],
    };
  }, [periods]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <SpinningDots size="lg" className="text-emerald-accent" />
      </div>
    );
  }
  if (error) return <p className="text-danger text-sm mt-4">{error}</p>;

  const rawName = username || session?.displayName || '';
  const name = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : '';
  const periodBadge = currentPeriod?.label
    ?? new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-theme-heading tracking-tight">Command Center</h1>
          <p className="text-sm text-theme-muted mt-1">
            {greeting()}{name ? ` ${name}` : ''} — operations overview.
          </p>
        </div>
        <span className="shrink-0 px-3 py-1 rounded-full border border-theme bg-theme-card text-[11px] font-semibold text-emerald-accent">
          {currentPeriod ? `Work period · ${periodBadge}` : periodBadge}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard compact label="Workers Online" value={workersOnline} icon={Users} />
        <KpiCard compact label="Active Sessions" value={activeSessions} icon={Activity} accent="blue" />
        <KpiCard compact label="Machines Online" value={machinesOnline} icon={Server} />
        <KpiCard
          compact
          label="Quality Index"
          value={qualityAvg != null ? `${qualityAvg.toFixed(1)}%` : '—'}
          icon={TrendingUp}
        />
        <KpiCard compact label="Exceptions" value={exceptions} icon={AlertTriangle} accent="danger" />
        <KpiCard compact label="Payroll Pending" value={payrollPending} icon={DollarSign} accent="gold" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartPanel title="KPI snapshot" subtitle="Live values from the cards above">
          <Bar data={kpiBarData} options={{ ...cartesianOptions, plugins: { ...baseOptions.plugins, legend: { display: false } } }} />
        </ChartPanel>

        <ChartPanel
          title="Sessions this work period"
          subtitle={currentPeriod
            ? `${currentPeriod.start_date.slice(0, 10)} → ${currentPeriod.end_date.slice(0, 10)}`
            : 'Last 14 days'}
        >
          <Line data={sessionsLine} options={sessionsLineOptions} />
        </ChartPanel>

        <ChartPanel title="Workers by status" subtitle={`${workers.length} total`}>
          {workers.length === 0 ? (
            <p className="text-sm text-theme-muted h-full flex items-center justify-center">No workers</p>
          ) : (
            <Doughnut
              data={workersDoughnut}
              options={{
                ...baseOptions,
                cutout: '62%',
              }}
            />
          )}
        </ChartPanel>

        <ChartPanel title="Machines by status" subtitle={`${machines.length} total`}>
          {machines.length === 0 ? (
            <p className="text-sm text-theme-muted h-full flex items-center justify-center">No machines</p>
          ) : (
            <PolarArea
              data={machinesPolar}
              options={{
                ...baseOptions,
                scales: {
                  r: {
                    ticks: { display: false },
                    grid: { color: GRID },
                    angleLines: { color: GRID },
                  },
                },
              }}
            />
          )}
        </ChartPanel>

        <ChartPanel title="Session types" subtitle="Within current work period">
          {(periodSessions.length || sessions.length) === 0 ? (
            <p className="text-sm text-theme-muted h-full flex items-center justify-center">No sessions</p>
          ) : (
            <Doughnut data={sessionTypesDoughnut} options={{ ...baseOptions, cutout: '55%' }} />
          )}
        </ChartPanel>

        <ChartPanel title="Quality components" subtitle="Average across scored workers">
          <Radar data={qualityRadar} options={qualityRadarOptions} />
        </ChartPanel>

        <ChartPanel title="Quality score bands" subtitle="Composite score distribution">
          <Bar
            data={qualityBars}
            options={{ ...cartesianOptions, plugins: { ...baseOptions.plugins, legend: { display: false } } }}
          />
        </ChartPanel>

        <ChartPanel title="Work periods by status" subtitle="Payroll pipeline">
          <Bar
            data={payrollBars}
            options={{ ...cartesianOptions, plugins: { ...baseOptions.plugins, legend: { display: false } } }}
          />
        </ChartPanel>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme">
          <h2 className="text-sm font-bold text-theme-heading">Live activity</h2>
          <Link href="/admin/audit-logs" className="text-xs font-semibold text-emerald-accent hover:underline">
            View all logs
          </Link>
        </div>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-theme-muted px-4 py-8 text-center">No recent activity.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-theme">
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Time</th>
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Actor</th>
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Action</th>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">Target</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-theme/60 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-xs font-mono text-theme-muted whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-theme-heading whitespace-nowrap">
                    {log.actor_id ? `${log.actor_id.slice(0, 8)}…` : 'System'}
                  </td>
                  <td className="px-3 py-2.5 text-emerald-accent font-semibold text-xs">{log.action}</td>
                  <td className="px-4 py-2.5 text-theme-muted text-xs hidden md:table-cell">
                    {log.target_type} {log.target_id.slice(0, 8)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
