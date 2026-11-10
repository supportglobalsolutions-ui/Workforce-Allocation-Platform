'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler, type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { AlertCircle, ArrowUpRight, Banknote, BarChart3, Briefcase, CircleDollarSign, Receipt, Users } from 'lucide-react';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { formatMoneyAmount, useMoneyDisplay } from '@/lib/money';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

type PeriodStatus = 'open' | 'calculated' | 'approved' | 'paid';
interface PayrollPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
}

interface ClientLine {
  client_id: string;
  client_name: string;
  billing: string;
  net_distributable: string;
  payout_amount: string;
  gs_amount: string;
  payout_status: string | null;
  warnings: string[];
}

interface Overview {
  period_id: string;
  period_label: string;
  status: string;
  kpis: {
    income_total: string;
    revenue: string;
    payee_payouts: string;
    payee_pending: string;
    worker_pay: string;
    worker_pay_pending: string;
    expenses: string;
    gs_keeps: string;
    hours: string;
    workers: string;
  };
  clients: ClientLine[];
}

interface TrendPoint {
  periodId: string;
  label: string;
  income: number;
  expenses: number;
  workerPay: number;
  payeePay: number;
  pendingPayeePay: number;
  gsKeeps: number;
  hours: number;
  workers: number;
}

const n = (value: string | number | null | undefined) => Number(value ?? 0) || 0;
const money = (value: string | number | null | undefined) => formatMoneyAmount(n(value), 'USD');
const number = (value: string | number | null | undefined) => n(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

function toTrendPoint(period: PayrollPeriod, overview: Overview): TrendPoint {
  const month = new Date(`${period.start_date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  return {
    periodId: period.id,
    label: month || period.label,
    income: n(overview.kpis.income_total),
    expenses: n(overview.kpis.expenses),
    workerPay: n(overview.kpis.worker_pay),
    payeePay: n(overview.kpis.payee_payouts),
    pendingPayeePay: n(overview.kpis.payee_pending),
    gsKeeps: n(overview.kpis.gs_keeps),
    hours: n(overview.kpis.hours),
    workers: n(overview.kpis.workers),
  };
}

function chartData(points: TrendPoint[], datasets: { label: string; key: keyof TrendPoint; color: string; yAxisID?: string }[]) {
  return {
    labels: points.map((point) => point.label),
    datasets: datasets.map((set) => ({
      label: set.label,
      data: points.map((point) => n(point[set.key] as number)),
      borderColor: set.color,
      backgroundColor: `${set.color}24`,
      pointBackgroundColor: set.color,
      pointBorderColor: 'var(--surface-container)',
      pointBorderWidth: 2,
      pointRadius: points.length > 1 ? 3 : 5,
      pointHoverRadius: 6,
      borderWidth: 2.5,
      tension: 0.32,
      fill: false,
      yAxisID: set.yAxisID ?? 'y',
    })),
  };
}

const baseOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'bottom', labels: { color: 'var(--on-surface-variant)', usePointStyle: true, boxWidth: 8, padding: 18 } },
    tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${typeof context.parsed.y === 'number' ? formatMoneyAmount(context.parsed.y, 'USD') : '—'}` } },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: 'var(--on-surface-variant)', maxRotation: 0, autoSkip: true } },
    y: { beginAtZero: true, grid: { color: 'rgba(127, 145, 138, 0.16)' }, ticks: { color: 'var(--on-surface-variant)', callback: (value) => `$${Number(value).toLocaleString()}` } },
  },
};

export default function PayrollControlPanel({ periodId }: { periodId: string }) {
  useMoneyDisplay();
  const [data, setData] = useState<Overview | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setTrend([]);

    Promise.all([
      api.get<Overview>(`/client-billing/periods/${periodId}/overview`),
      api.get<PayrollPeriod[]>('/payroll/periods'),
    ])
      .then(async ([overview, allPeriods]) => {
        if (!active) return;
        setData(overview);
        const chronological = [...allPeriods].sort((a, b) => a.start_date.localeCompare(b.start_date));
        const selectedIndex = chronological.findIndex((period) => period.id === periodId);
        const throughSelected = selectedIndex >= 0 ? chronological.slice(0, selectedIndex + 1) : chronological;
        const months = throughSelected.slice(-12);
        const historic = await Promise.all(months.map(async (period) => {
          if (period.id === periodId) return toTrendPoint(period, overview);
          const monthOverview = await api.get<Overview>(`/client-billing/periods/${period.id}/overview`);
          return toTrendPoint(period, monthOverview);
        }));
        if (active) setTrend(historic);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load the financial control panel.'); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [periodId]);

  const clients = useMemo(() => [...(data?.clients ?? [])].sort((a, b) => n(b.payout_amount) - n(a.payout_amount)), [data]);
  const kpis = data?.kpis;
  const axisMoneyOptions = useMemo<ChartOptions<'line'>>(() => ({
    ...baseOptions,
    plugins: { ...baseOptions.plugins, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${money(context.parsed.y)}` } } },
  }), []);
  const workforceOptions = useMemo<ChartOptions<'line'>>(() => ({
    ...baseOptions,
    plugins: { ...baseOptions.plugins, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${number(context.parsed.y)}${context.dataset.yAxisID === 'y' ? ' hours' : ''}` } } },
    scales: {
      x: baseOptions.scales?.x,
      y: { beginAtZero: true, position: 'left', grid: { color: 'rgba(127, 145, 138, 0.16)' }, title: { display: true, text: 'Hours', color: 'var(--on-surface-variant)' }, ticks: { color: 'var(--on-surface-variant)' } },
      y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Workers', color: 'var(--on-surface-variant)' }, ticks: { color: 'var(--on-surface-variant)', precision: 0 } },
    },
  }), []);

  if (loading) return <div className="flex justify-center py-20"><SpinningDots size="lg" className="text-emerald-accent" /></div>;
  if (error || !data || !kpis) return (
    <div className="glass-panel flex items-center gap-2 p-4 text-sm text-danger"><AlertCircle size={16} /> {error ?? 'No control panel data is available for this month.'}</div>
  );

  return (
    <section aria-label="Financial control panel" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={17} className="text-emerald-accent" />
            <h2 className="text-base font-bold text-theme-heading">Financial control panel</h2>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">{data.status}</span>
          </div>
          <p className="mt-1 text-xs text-theme-muted">{data.period_label} · current totals and up to 12 months of trends · USD unless labeled</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link href={`/admin/clients/ledger?period=${periodId}`} className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2">Client ledger <ArrowUpRight size={13} /></Link>
          <Link href={`/admin/payroll/ledger?period=${periodId}`} className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2">Worker ledger <ArrowUpRight size={13} /></Link>
          <Link href={`/admin/payroll/month-data?period=${periodId}`} className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2">Add month data <ArrowUpRight size={13} /></Link>
          <Link href={`/admin/clients/recipients?period=${periodId}`} className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2">Recipients <ArrowUpRight size={13} /></Link>
        </div>
      </div>


      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard compact label="Workers this month" value={number(kpis.workers)} icon={Users} accent="blue" />
        <KpiCard compact label="Total hours" value={`${number(kpis.hours)} h`} icon={BarChart3} accent="blue" />
        <KpiCard compact label="Total income" value={money(kpis.income_total)} icon={Briefcase} accent="gold" />
        <KpiCard compact label="Total worker pay" value={money(kpis.worker_pay)} icon={Banknote} />
        <KpiCard compact label="Recipient payouts" value={money(kpis.payee_payouts)} icon={CircleDollarSign} accent="blue" />
        <KpiCard compact label="Pending recipient pay" value={money(kpis.payee_pending)} icon={CircleDollarSign} accent="gold" />
        <KpiCard compact label="Pending worker pay" value={money(kpis.worker_pay_pending)} icon={Users} accent="danger" />
        <KpiCard compact label="Expenses" value={money(kpis.expenses)} icon={Receipt} accent="danger" />
        <KpiCard compact label="Global Solutions keeps" value={money(kpis.gs_keeps)} icon={BarChart3} accent="emerald" highlight />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="glass-panel p-4">
          <h3 className="text-sm font-bold text-theme-heading">Income and expenses over time</h3>
          <p className="mb-2 mt-1 text-xs text-theme-muted">Monthly income received compared with transfer, shared and one-off costs.</p>
          <div className="h-[270px]">
            <Line data={chartData(trend, [
              { label: 'Income', key: 'income', color: '#10b981' },
              { label: 'Expenses', key: 'expenses', color: '#fb7185' },
            ])} options={axisMoneyOptions} />
          </div>
        </div>
        <div className="glass-panel p-4">
          <h3 className="text-sm font-bold text-theme-heading">Worker pay, recipient payouts, and what GS keeps</h3>
          <p className="mb-2 mt-1 text-xs text-theme-muted">Monthly worker pay, payouts to recipients, and what Global Solutions keeps.</p>
          <div className="h-[270px]">
            <Line data={chartData(trend, [
              { label: 'Worker pay', key: 'workerPay', color: '#e6b735' },
              { label: 'Recipient payouts', key: 'payeePay', color: '#38bdf8' },
              { label: 'Global Solutions keeps', key: 'gsKeeps', color: '#10b981' },
              { label: 'Pending recipient pay', key: 'pendingPayeePay', color: '#a78bfa' },
            ])} options={axisMoneyOptions} />
          </div>
        </div>
        <div className="glass-panel p-4 xl:col-span-2">
          <h3 className="text-sm font-bold text-theme-heading">Workforce and hours over time</h3>
          <p className="mb-2 mt-1 text-xs text-theme-muted">Hours worked and number of workers contributing each month.</p>
          <div className="h-[250px]">
            <Line data={chartData(trend, [
              { label: 'Hours', key: 'hours', color: '#38bdf8', yAxisID: 'y' },
              { label: 'Workers', key: 'workers', color: '#e6b735', yAxisID: 'y1' },
            ])} options={workforceOptions} />
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="border-b border-theme px-4 py-3">
          <h3 className="text-sm font-bold text-theme-heading">Client splits this month</h3>
          <p className="mt-1 text-xs text-theme-muted">Each client&apos;s net, what goes to its recipients, and whether that is paid.</p>
        </div>
        {clients.length === 0 ? <p className="p-5 text-center text-sm text-theme-muted">No client splits this month.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-theme text-[10px] uppercase tracking-wider text-theme-muted">
                <th className="px-4 py-2.5 text-left">Client</th><th className="px-4 py-2.5 text-right">Net distributable</th><th className="px-4 py-2.5 text-right">To recipients</th><th className="px-4 py-2.5 text-right">GS keeps</th><th className="px-4 py-2.5 text-right">Status</th>
              </tr></thead>
              <tbody>{clients.map((client) => (
                <tr key={client.client_id} className="border-b border-theme last:border-0">
                  <td className="px-4 py-3 font-medium text-theme-heading">{client.client_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(client.net_distributable)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(client.payout_amount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-accent">{money(client.gs_amount)}</td>
                  <td className={`px-4 py-3 text-right text-xs font-semibold uppercase ${client.payout_status === 'paid' ? 'text-emerald-accent' : 'text-amber-500'}`}>{client.payout_status ?? 'Pending'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
