'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Building2, Check, ClipboardList, Receipt, Table2, Users } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import PeriodFilter from '@/components/platform/PeriodFilter';
import SpinningDots from '@/components/shared/SpinningDots';
import PeriodLedgerSheet, { type LedgerRow } from '@/components/admin/PeriodLedgerSheet';
import ApplyToManyPanel from '@/components/admin/ApplyToManyPanel';
import type { PayRow } from '@/components/admin/WorkerPayModal';
import { ClientEarningsSection, SharedCostsSection, type LedgerPeriod } from '@/components/payroll/SharedCosts';
import { api } from '@/lib/api';
import { pickCurrentPeriod } from '@/lib/periods';

type Step = 'clients' | 'shared-costs' | 'workers';

const STEPS: { key: Step; label: string; hint: string; icon: typeof Users }[] = [
  { key: 'clients', label: 'Client earnings', hint: 'What each client earned this month', icon: Building2 },
  { key: 'shared-costs', label: 'Shared costs', hint: 'Costs split across workers and clients', icon: Receipt },
  { key: 'workers', label: 'Worker pay', hint: 'Hours, rate, bonus, costs and FX — every payslip field', icon: Users },
];

const isStep = (v: string | null): v is Step => STEPS.some((s) => s.key === v);

export default function LedgerPage() {
  const router = useRouter();
  const [periods, setPeriods] = useState<LedgerPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [step, setStep] = useState<Step>('workers');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [applyOpen, setApplyOpen] = useState(false);

  const loadPeriods = useCallback((keepId?: string) => {
    api.get<LedgerPeriod[]>('/payroll/periods')
      .then((list) => {
        setPeriods(list);
        setPeriodId((current) => {
          const wanted = keepId || current;
          if (wanted && list.some((p) => p.id === wanted)) return wanted;
          return pickCurrentPeriod(list)?.id ?? list[0]?.id ?? '';
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load work months'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (isStep(tab)) setStep(tab);
    loadPeriods(params.get('period') || undefined);
  }, [loadPeriods]);

  useEffect(() => {
    if (!periodId) return;
    router.replace(`/admin/payroll/ledger?period=${periodId}&tab=${step}`, { scroll: false });
  }, [router, periodId, step]);

  const period = periods.find((p) => p.id === periodId) ?? null;
  const locked = period?.status === 'approved' || period?.status === 'paid';
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const next = STEPS[stepIndex + 1];

  // Shared costs and earnings change payslip figures, so the sheet reloads after them.
  const payslipsChanged = useCallback(() => {
    setReloadKey((k) => k + 1);
    loadPeriods();
  }, [loadPeriods]);

  return (
    <div>
      <PageHeader
        title="Ledger"
        description="Enter everything for the month in one place: client earnings, shared costs, and every payslip field for every worker."
        actions={
          <Link href="/admin/payroll" className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
            <ArrowLeft size={14} /> Payroll
          </Link>
        }
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : !period ? (
        <p className="text-theme-muted text-sm">{error || 'No working months yet.'}</p>
      ) : (
        <div className="space-y-4">
          <div className="glass-panel p-4 flex flex-wrap items-end gap-4">
            <div className="w-full sm:w-auto sm:min-w-[18rem]">
              <PeriodFilter periods={periods} value={periodId} onChange={setPeriodId} variant="select" label="Working month" />
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setStep('clients')}
              className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
              title="Walk through the month: client earnings, then shared costs, then worker pay."
            >
              <ClipboardList size={13} /> Enter month data
            </button>
            {!locked && (
              <button
                type="button"
                onClick={() => setApplyOpen(true)}
                disabled={!rows.length}
                className="btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5 disabled:opacity-50"
                title="Set the same rate, bonus, cost or currency on many workers at once."
              >
                <Users size={13} /> Apply to many
              </button>
            )}
          </div>

          {locked && (
            <p className="text-xs text-amber-400">
              {period.label} is {period.status}. Reopen it on Payroll to change anything here.
            </p>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {message && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-sm">
              <Check size={14} /> {message}
            </div>
          )}

          <nav aria-label="Month data" className="grid gap-2 sm:grid-cols-3">
            {STEPS.map((s, i) => {
              const active = s.key === step;
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStep(s.key)}
                  aria-current={active ? 'step' : undefined}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? 'border-emerald-accent/50 bg-emerald-accent/10'
                      : 'border-white/10 bg-white/[0.02] hover:border-emerald-accent/30'
                  }`}
                >
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    active ? 'bg-emerald-accent text-black' : 'bg-white/[0.06] text-theme-muted'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`flex items-center gap-1.5 text-sm font-semibold ${active ? 'text-emerald-accent' : 'text-theme-heading'}`}>
                      <Icon size={13} /> {s.label}
                    </span>
                    <span className="block text-[11px] text-theme-muted mt-0.5">{s.hint}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {step === 'clients' && <ClientEarningsSection key={period.id} period={period} onChanged={payslipsChanged} />}
          {step === 'shared-costs' && <SharedCostsSection key={period.id} period={period} onChanged={payslipsChanged} />}
          {/* Kept mounted so unsaved sheet edits survive switching steps. */}
          <div className={step === 'workers' ? '' : 'hidden'}>
            <PeriodLedgerSheet
              key={period.id}
              periodId={period.id}
              periodCurrency={period.currency}
              locked={locked}
              reloadKey={reloadKey}
              onSaved={() => loadPeriods()}
              onRowsLoaded={setRows}
              onSelectionChange={setSelectedIds}
            />
          </div>

          <div className="flex justify-end">
            {next ? (
              <button type="button" onClick={() => setStep(next.key)} className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
                Next: {next.label} <ArrowRight size={14} />
              </button>
            ) : !locked && (
              <button type="button" onClick={() => setApplyOpen(true)} disabled={!rows.length}
                className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50">
                <Table2 size={14} /> Next: Apply to many
              </button>
            )}
          </div>
        </div>
      )}

      {applyOpen && period && !locked && (
        <ApplyToManyPanel
          open={applyOpen}
          onClose={() => setApplyOpen(false)}
          periodId={period.id}
          periodLabel={period.label}
          periodCurrency={period.currency}
          rows={rows as unknown as PayRow[]}
          selectedIds={selectedIds}
          onApplied={(count) => {
            setMessage(`Applied to ${count} worker${count === 1 ? '' : 's'}.`);
            setError(null);
            payslipsChanged();
          }}
          onError={(text) => { setError(text); setMessage(null); }}
        />
      )}
    </div>
  );
}
