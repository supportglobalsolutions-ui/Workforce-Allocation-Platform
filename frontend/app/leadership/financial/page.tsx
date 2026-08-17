'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import PeriodFilter from '@/components/platform/PeriodFilter';
import SpinningDots from '@/components/shared/SpinningDots';
import { AlertCircle, DollarSign, PieChart, TrendingUp, Users } from 'lucide-react';
import { api } from '@/lib/api';

interface PayrollPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  currency: string;
  status: string;
}

interface PayrollReportRow {
  worker_display_name: string;
  final_net: string | number;
  gross_earned: string | number;
  base_equivalent: string | number;
}

interface RevenueShareRow {
  client_id: string;
  client_name: string;
  platform: string;
  earnings: string;
  worker_cost: string;
  distributable: string;
  gs_share: string;
  owner_share: string;
}

const fmt = (x: number, currency = 'USD') =>
  `${currency} ${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FinancialIntelligencePage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [payrollRows, setPayrollRows] = useState<PayrollReportRow[]>([]);
  const [revenueRows, setRevenueRows] = useState<RevenueShareRow[]>([]);

  useEffect(() => {
    api.get<PayrollPeriod[]>('/payroll/periods')
      .then((list) => {
        setPeriods(list);
        if (list.length > 0) setPeriodId(list[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load working months.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!periodId) return;
    setReportsLoading(true);
    Promise.all([
      api.get<PayrollReportRow[]>(`/payroll/periods/${periodId}/reports/payroll`),
      api.get<RevenueShareRow[]>(`/payroll/periods/${periodId}/reports/revenue-share`),
    ])
      .then(([payroll, revenue]) => {
        setPayrollRows(payroll);
        setRevenueRows(revenue);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load financials.'))
      .finally(() => setReportsLoading(false));
  }, [periodId]);

  const selected = periods.find((p) => p.id === periodId) ?? null;
  const currency = selected?.currency ?? 'USD';

  const kpis = useMemo(() => {
    const grossRevenue = revenueRows.reduce((s, r) => s + Number(r.earnings ?? 0), 0);
    const workerPayouts = payrollRows.reduce((s, r) => s + Number(r.final_net ?? 0), 0);
    const payrollCosts = revenueRows.reduce((s, r) => s + Number(r.worker_cost ?? 0), 0)
      || payrollRows.reduce((s, r) => s + Number(r.gross_earned ?? 0), 0);
    const netProfit = revenueRows.reduce((s, r) => s + Number(r.distributable ?? 0), 0);
    return { grossRevenue, workerPayouts, payrollCosts, netProfit };
  }, [payrollRows, revenueRows]);

  return (
    <div>
      <PageHeader
        title="Financial Intelligence"
        description="Look back at a named working month for revenue, payouts, and profit."
      />

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error && periods.length === 0 ? (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
          <AlertCircle size={14} /> {error}
        </div>
      ) : periods.length === 0 ? (
        <p className="text-sm text-theme-muted">No working months yet. Create one on the Payroll page.</p>
      ) : (
        <>
          <PeriodFilter
            periods={periods}
            value={periodId}
            onChange={setPeriodId}
            variant="select"
            label="Working month"
          />

          {reportsLoading ? (
            <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <KpiCard label="Gross Revenue" value={fmt(kpis.grossRevenue, currency)} icon={DollarSign} accent="gold" />
                <KpiCard label="Worker Payouts" value={fmt(kpis.workerPayouts, currency)} icon={Users} />
                <KpiCard label="Payroll Costs" value={fmt(kpis.payrollCosts, currency)} icon={PieChart} />
                <KpiCard label="Net Profit" value={fmt(kpis.netProfit, currency)} icon={TrendingUp} accent="gold" />
              </div>
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="glass-panel p-6">
                  <h2 className="font-bold text-white mb-4">Revenue by Client</h2>
                  {revenueRows.length === 0 ? (
                    <p className="text-sm text-brand-on-surface-variant">No client revenue for this month.</p>
                  ) : (
                    <ul className="divide-y divide-white/[0.05]">
                      {revenueRows.map((r) => (
                        <li key={r.client_id} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{r.client_name}</p>
                            <p className="text-[11px] text-theme-muted">{r.platform}</p>
                          </div>
                          <p className="text-sm font-mono text-gold-accent shrink-0">
                            {fmt(Number(r.earnings ?? 0), currency)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="glass-panel p-6">
                  <h2 className="font-bold text-white mb-4">Profit for {selected?.label ?? 'this month'}</h2>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-theme-muted">Earnings</dt>
                      <dd className="font-mono text-white">{fmt(kpis.grossRevenue, currency)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-theme-muted">Worker cost</dt>
                      <dd className="font-mono text-white">{fmt(kpis.payrollCosts, currency)}</dd>
                    </div>
                    <div className="flex justify-between gap-3 border-t border-white/10 pt-2">
                      <dt className="text-theme-muted">Distributable profit</dt>
                      <dd className="font-mono text-emerald-accent">{fmt(kpis.netProfit, currency)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
