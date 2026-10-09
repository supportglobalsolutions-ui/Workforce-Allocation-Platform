'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertCircle, AlertTriangle, ArrowRight, Banknote, Briefcase, CheckCircle2, Circle, Clock, Receipt, TrendingUp, Users,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import PeriodFilter from '@/components/platform/PeriodFilter';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { pickCurrentPeriod } from '@/lib/periods';

interface Period {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
  currency: string;
  is_current?: boolean;
}

interface Step {
  key: string;
  title: string;
  done: boolean;
  detail: string;
  href: string;
  issues: string[];
}

interface ClientRow {
  client_id: string;
  client_name: string;
  billed_hours: string | null;
  expected: string | null;
  actual: string | null;
  basis: string;
  client_pct: string;
  client_costs: string;
  client_share: string;
  gs_share: string;
  worker_cost: string;
  gs_margin: string;
  payout_status: string | null;
  warnings: string[];
}

interface Overview {
  period_id: string;
  period_label: string;
  status: string;
  currency: string;
  steps: Step[];
  kpis: Record<'collected' | 'expected' | 'client_shares' | 'costs' | 'worker_pay' | 'gs_margin' | 'hours', string>;
  clients: ClientRow[];
}

const n = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const money = (v: string | number | null | undefined) =>
  v == null ? '—' : n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FLOW = [
  { key: 'client_shares', label: 'Client shares', color: 'bg-sky-400' },
  { key: 'worker_pay', label: 'Worker pay', color: 'bg-gold-accent' },
  { key: 'costs', label: 'Costs', color: 'bg-rose-400' },
  { key: 'gs_margin', label: 'GS margin', color: 'bg-emerald-accent' },
] as const;

export default function MonthOverviewPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Period[]>('/payroll/periods')
      .then((list) => {
        setPeriods(list);
        const wanted = new URLSearchParams(window.location.search).get('period');
        const pick = list.find((p) => p.id === wanted) ?? pickCurrentPeriod(list) ?? list[0];
        if (pick) setPeriodId(pick.id);
        else setLoading(false);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Failed to load work months'); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!periodId) return;
    setLoading(true);
    setError(null);
    api.get<Overview>(`/client-billing/periods/${periodId}/overview`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the month'))
      .finally(() => setLoading(false));
  }, [periodId]);

  const k = data?.kpis;
  const collected = n(k?.collected);
  const segments = FLOW.map((f) => ({ ...f, value: n(k?.[f.key]) }));
  const outflow = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const barTotal = Math.max(collected, outflow, 1);
  const nextStep = data?.steps.find((s) => !s.done);
  const doneCount = data?.steps.filter((s) => s.done).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Month Overview"
        description="The month-end steps in order, and where the month's money went. Figures are in USD."
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      <div className="glass-panel p-4 mb-4 flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-auto sm:min-w-[18rem]">
          <PeriodFilter periods={periods} value={periodId} onChange={setPeriodId} variant="select" label="Working month" />
        </div>
        <div className="flex-1" />
        {data && (
          <span className="text-xs text-theme-muted">
            {doneCount} of {data.steps.length} steps done · status <span className="text-white font-semibold capitalize">{data.status}</span>
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading || !data ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.steps.map((s, i) => {
              const isNext = nextStep?.key === s.key;
              return (
                <Link key={s.key} href={s.href}
                  className={`glass-panel p-4 flex gap-3 group transition-colors hover:border-emerald-accent/40 ${
                    isNext ? 'border border-gold-accent/40' : ''
                  }`}>
                  <span className={`mt-0.5 shrink-0 ${s.done ? 'text-emerald-accent' : isNext ? 'text-gold-accent' : 'text-theme-muted'}`}>
                    {s.done ? <CheckCircle2 size={18} /> : isNext ? <Clock size={18} /> : <Circle size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="text-theme-muted tabular-nums">{i + 1}</span> {s.title}
                      {isNext && <span className="text-[9px] uppercase font-bold text-gold-accent">Next</span>}
                    </p>
                    <p className="text-xs text-theme-muted mt-0.5">{s.detail}</p>
                    {s.issues.map((issue) => (
                      <p key={issue} className="text-[11px] text-amber-400 mt-1 flex items-start gap-1">
                        <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {issue}
                      </p>
                    ))}
                  </div>
                  <ArrowRight size={14} className="text-theme-muted group-hover:text-emerald-accent mt-1 shrink-0" />
                </Link>
              );
            })}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard compact label="Collected" value={money(k?.collected)} icon={Briefcase} accent="gold" />
            <KpiCard compact label="Client shares" value={money(k?.client_shares)} icon={Users} accent="blue" />
            <KpiCard compact label="Worker pay" value={money(k?.worker_pay)} icon={Banknote} />
            <KpiCard compact label="Costs" value={money(k?.costs)} icon={Receipt} accent="danger" />
            <KpiCard compact label="GS margin" value={money(k?.gs_margin)} icon={TrendingUp}
              accent={n(k?.gs_margin) < 0 ? 'danger' : 'emerald'} highlight />
          </div>

          <div className="glass-panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="text-sm font-bold text-theme-heading">Where the money went</h2>
              <span className="text-xs text-theme-muted">
                Collected {money(k?.collected)} USD
                {n(k?.expected) !== collected && ` · expected ${money(k?.expected)}`}
                {` · ${money(k?.hours)} h logged`}
              </span>
            </div>
            <div className="h-6 w-full rounded-lg overflow-hidden flex bg-white/[0.04]">
              {segments.filter((s) => s.value > 0).map((s) => (
                <div key={s.key} className={`${s.color} h-full`} style={{ width: `${(s.value / barTotal) * 100}%` }}
                  title={`${s.label}: ${money(s.value)} USD`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs">
              {segments.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-theme-muted">
                  <span className={`w-2.5 h-2.5 rounded-sm ${s.color}`} />
                  {s.label} <span className={`tabular-nums ${s.value < 0 ? 'text-danger' : 'text-white'}`}>{money(s.value)}</span>
                  {collected > 0 && <span className="tabular-nums">({((s.value / collected) * 100).toFixed(0)}%)</span>}
                </span>
              ))}
            </div>
            {outflow > collected + 0.005 && (
              <p className="text-[11px] text-amber-400 mt-2">Paying out more than was collected this month.</p>
            )}
          </div>

          <div className="glass-panel overflow-x-auto">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-sm font-bold text-theme-heading">Clients</h2>
              <Link href={`/admin/clients/ledger?period=${data.period_id}`} className="text-xs text-emerald-accent hover:underline">
                Open client ledger
              </Link>
            </div>
            {data.clients.length === 0 ? (
              <p className="text-center text-theme-muted text-sm py-10">No client income this month yet.</p>
            ) : (
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-theme-muted">
                    <th className="text-left px-4 py-2.5 font-bold">Client</th>
                    <th className="text-right px-3 py-2.5 font-bold">Hours</th>
                    <th className="text-right px-3 py-2.5 font-bold">Expected</th>
                    <th className="text-right px-3 py-2.5 font-bold">Received</th>
                    <th className="text-right px-3 py-2.5 font-bold">Client %</th>
                    <th className="text-right px-3 py-2.5 font-bold">Costs</th>
                    <th className="text-right px-3 py-2.5 font-bold">Client share</th>
                    <th className="text-right px-3 py-2.5 font-bold">GS share</th>
                    <th className="text-right px-3 py-2.5 font-bold">Worker cost</th>
                    <th className="text-right px-3 py-2.5 font-bold">Margin</th>
                    <th className="text-left px-4 py-2.5 font-bold">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clients.map((c) => (
                    <tr key={c.client_id} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-4 py-2.5 text-white font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {c.client_name}
                          {c.warnings.length > 0 && (
                            <span title={c.warnings.join('\n')} className="text-amber-400"><AlertTriangle size={12} /></span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-theme-muted">{c.billed_hours ? money(c.billed_hours) : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-theme-muted">{money(c.expected)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-white">{money(c.actual)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-theme-muted">{n(c.client_pct).toFixed(2)}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-theme-muted">{n(c.client_costs) ? money(c.client_costs) : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-sky-300">{money(c.client_share)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-white">{money(c.gs_share)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-theme-muted">{money(c.worker_cost)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${n(c.gs_margin) < 0 ? 'text-danger' : 'text-emerald-accent'}`}>
                        {money(c.gs_margin)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-theme-muted capitalize">{c.payout_status ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
