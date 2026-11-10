'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import PeriodFilter from '@/components/platform/PeriodFilter';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import PeriodLedgerSheet from '@/components/admin/PeriodLedgerSheet';
import MonthIncome from '@/components/payroll/MonthIncome';
import { SharedCostsSection, type LedgerPeriod } from '@/components/payroll/SharedCosts';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { pickCurrentPeriod } from '@/lib/periods';

export default function AddMonthDataPage() {
  const [incomeActionsTarget, setIncomeActionsTarget] = useState<HTMLDivElement | null>(null);
  const [payrollReload, setPayrollReload] = useState(0);
  const [periods, setPeriods] = useState<LedgerPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<LedgerPeriod[]>('/payroll/periods').then(list => {
      setPeriods(list);
      const wanted = new URLSearchParams(window.location.search).get('period');
      setPeriodId((list.find(p => p.id === wanted) ?? pickCurrentPeriod(list) ?? list[0])?.id ?? '');
    }).catch(e => setError(e instanceof Error ? e.message : 'Could not load working months'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (periodId) window.history.replaceState(null, '', `/admin/payroll/month-data?period=${encodeURIComponent(periodId)}`);
  }, [periodId]);
  const period = periods.find(p => p.id === periodId);
  return <div>
    <PageHeader compact title="Month Data" besideTitle={<div ref={setIncomeActionsTarget} />} actions={<PeriodFilter periods={periods} value={periodId} onChange={setPeriodId} variant="inline" label="Working month" />} />
    <AdminSectionTabs tabs={PAYROLL_TABS} />
    {error && <p role="alert" className="text-danger text-sm">{error}</p>}
    {loading ? <SpinningDots size="lg" /> : period ? <div className="space-y-8" key={period.id}>
      <section aria-label="Income"><MonthIncome periodId={period.id} actionsTarget={incomeActionsTarget} /></section>
      <section aria-label="Costs"><h2 className="text-xl font-bold text-theme-heading mb-3">Costs</h2><SharedCostsSection period={period} onChanged={() => setPayrollReload(value => value + 1)} /></section>
      <section aria-label="Payslip data">
        <h2 className="text-xl font-bold text-theme-heading mb-2">Payslip data</h2>
        <p className="text-sm text-theme-muted mb-3">Select a worker to add or edit hours, rate, bonus, transfer costs, external costs, currency and exchange rate in a pop-up. You can also use the eye on their row.</p>
        <PeriodLedgerSheet key={period.id} entryControls periodId={period.id} periodLabel={period.label} periodCurrency={period.currency}
          locked={period.status === 'approved' || period.status === 'paid'} reloadKey={payrollReload} onSaved={() => undefined} />
      </section>
    </div> : <p className="text-theme-muted text-sm">No working months available.</p>}
  </div>;
}
