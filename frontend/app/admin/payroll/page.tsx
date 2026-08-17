'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Calculator, Check, CheckCircle, ChevronDown, ChevronRight, Clock,
  DollarSign, Eye, Pencil, Plus, RotateCcw, Send, Table2, Trash2,
  Users, Wallet, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import DataTable from '@/components/platform/DataTable';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import PeriodLedgerModal from '@/components/admin/PeriodLedgerModal';
import ApplyToManyPanel from '@/components/admin/ApplyToManyPanel';
import WorkerPayModal, { type PayRow } from '@/components/admin/WorkerPayModal';
import PeriodNameEditor from '@/components/payroll/PeriodNameEditor';
import PeriodFilter from '@/components/platform/PeriodFilter';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';

// ── Types ──────────────────────────────────────────────────────────────────────

type PeriodStatus = 'open' | 'calculated' | 'approved' | 'paid';

interface PayrollPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  currency: 'USD' | 'GBP';
  status: PeriodStatus;
  approved_by: string | null;
  export_generated_at: string | null;
  wallet_pushed_at: string | null;
  paid_at: string | null;
  created_at: string;
}

interface CostPool {
  id?: string;
  country: string;
  transfer_cost_total: string | number;
  external_cost_total: string | number;
  note: string | null;
}

interface RateEntry {
  id: string;
  worker_id: string | null;
  pay_tier: string | null;
  rate_type: string;
  amount: string | number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  change_reason: string | null;
  created_at: string;
}

interface WorkerLite {
  id: string;
  display_name: string;
  country: string;
  pay_tier: string;
  worker_type: string;
}

interface Country { name: string; currency_code: string; is_active: boolean; }

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (x: string | number | null | undefined) =>
  Number(x ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CHIP: Record<PeriodStatus, string> = {
  open:       'bg-warning/15 text-warning border-warning/30',
  calculated: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  approved:   'bg-emerald-accent/15 text-emerald-accent border-emerald-accent/30',
  paid:       'bg-gold-accent/15 text-gold-accent border-gold-accent/30',
};

function PeriodStatusChip({ status }: { status: PeriodStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_CHIP[status]}`}>
      {status}
    </span>
  );
}

function FlagChips({ flags }: { flags: string[] }) {
  if (!flags || flags.length === 0) return <span className="text-theme-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${
            f === 'negative_net'
              ? 'bg-danger/15 text-danger border-danger/30'
              : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
          }`}
        >
          {f.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  );
}

function Banner({ kind, children, onDismiss }: { kind: 'success' | 'error' | 'info'; children: React.ReactNode; onDismiss?: () => void }) {
  const styles = {
    success: 'bg-emerald-accent/10 border-emerald-accent/30 text-emerald-accent',
    error:   'bg-danger/10 border-danger/30 text-danger',
    info:    'bg-gold-accent/10 border-gold-accent/30 text-gold-accent',
  }[kind];
  const Icon = kind === 'success' ? CheckCircle : AlertCircle;
  return (
    <div className={`flex items-center gap-2 p-3 rounded-xl border text-xs mb-4 ${styles}`}>
      <Icon size={14} className="shrink-0" />
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="opacity-70 hover:opacity-100"><X size={12} /></button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`glass-panel rounded-2xl border border-white/10 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-base font-bold text-theme-heading">{title}</h2>
            {subtitle && <p className="text-xs text-theme-muted mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}

// ── New Working Month Modal ────────────────────────────────────────────────────

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKeyFromDate(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function labelFromMonthKey(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function boundsForMonth(ym: string): { start: string; end: string; label: string } {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // last day of month
  return { start: toISODate(start), end: toISODate(end), label: labelFromMonthKey(ym) };
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function NewPeriodModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: PayrollPeriod) => void }) {
  const initial = boundsForMonth(currentMonthKey());
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [customDates, setCustomDates] = useState(false);
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [currency, setCurrency] = useState<'USD' | 'GBP'>('USD');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatedLabel = labelFromMonthKey(monthKeyFromDate(startDate));

  function applyMonth(ym: string, keepCustomRange: boolean) {
    const b = boundsForMonth(ym);
    setMonthKey(ym);
    if (!keepCustomRange) {
      setStartDate(b.start);
      setEndDate(b.end);
    }
  }

  function handleMonthChange(ym: string) {
    applyMonth(ym, customDates);
  }

  function handleToggleCustom(next: boolean) {
    setCustomDates(next);
    if (!next) {
      // Snap back to full calendar month.
      const b = boundsForMonth(monthKey);
      setStartDate(b.start);
      setEndDate(b.end);
    }
  }

  function handleStartChange(iso: string) {
    setStartDate(iso);
    setMonthKey(monthKeyFromDate(iso));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const created = await api.post<PayrollPeriod>('/payroll/periods', {
        start_date: startDate,
        end_date: endDate,
        currency,
        status: 'open',
      });
      onCreated(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create working month.');
    } finally { setSaving(false); }
  }

  return (
    <ModalShell
      title="New Working Month"
      subtitle="Defaults to a full calendar month. Turn on custom dates if pay runs across month boundaries."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Working Month">
          <input
            type="month"
            required
            value={monthKey}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="input-field"
          />
          <p className="text-[10px] text-theme-muted mt-1.5 leading-snug">
            Named automatically from the start month (e.g. March 2026). Each name can only be used once.
          </p>
        </Field>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={customDates}
            onChange={(e) => handleToggleCustom(e.target.checked)}
            className="accent-emerald-400"
          />
          <span className="text-[13px] text-white">Custom date range</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Start Date">
            <input
              type="date"
              required
              value={startDate}
              disabled={!customDates}
              onChange={(e) => handleStartChange(e.target.value)}
              className="input-field disabled:opacity-60"
            />
          </Field>
          <Field label="End Date">
            <input
              type="date"
              required
              value={endDate}
              disabled={!customDates}
              onChange={(e) => setEndDate(e.target.value)}
              className="input-field disabled:opacity-60"
            />
          </Field>
        </div>

        <Field label="Period name">
          <p className="text-sm font-semibold text-white px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10">
            {generatedLabel}
          </p>
        </Field>

        <Field label="Reporting Currency">
          <div className="relative">
            <select value={currency} onChange={(e) => setCurrency(e.target.value as 'USD' | 'GBP')} className="input-field appearance-none pr-8">
              <option value="USD">USD — US Dollar</option>
              <option value="GBP">GBP — British Pound</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
          </div>
        </Field>
        {error && <Banner kind="error">{error}</Banner>}
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
            {saving ? <SpinningDots size="sm" /> : <Plus size={14} />} Create Working Month
          </button>
        </div>
      </form>
    </ModalShell>
  );
}


// ── New Rate Modal ─────────────────────────────────────────────────────────────

function NewRateModal({ workers, onClose, onCreated }: {
  workers: WorkerLite[]; onClose: () => void; onCreated: () => void;
}) {
  const [target, setTarget] = useState<'worker' | 'tier'>('worker');
  const [workerId, setWorkerId] = useState('');
  const [payTier, setPayTier] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api.post('/rates', {
        ...(target === 'worker' ? { worker_id: workerId } : { pay_tier: payTier }),
        rate_type: 'hourly',
        amount: Number(amount),
        currency,
        effective_from: effectiveFrom,
        change_reason: changeReason,
      });
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create rate.');
    } finally { setSaving(false); }
  }

  return (
    <ModalShell title="New Hourly Rate" subtitle="Applies to a specific worker or an entire pay tier." onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Target">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([['worker', 'Specific Worker'], ['tier', 'Pay Tier']] as const).map(([key, lbl]) => (
              <button key={key} type="button" onClick={() => setTarget(key)}
                className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  target === key
                    ? 'border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent'
                    : 'border-white/10 text-theme-muted hover:border-emerald-accent/20'
                }`}>
                {lbl}
              </button>
            ))}
          </div>
        </Field>
        {target === 'worker' ? (
          <Field label="Worker">
            <div className="relative">
              <select required value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="input-field appearance-none pr-8">
                <option value="" disabled>Select a worker…</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.display_name} — {w.country} ({w.pay_tier})</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
            </div>
          </Field>
        ) : (
          <Field label="Pay Tier">
            <input required value={payTier} onChange={(e) => setPayTier(e.target.value)} placeholder="e.g. tier_1" className="input-field" />
          </Field>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Amount / hr">
            <input type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} className="input-field" />
          </Field>
          <Field label="Currency">
            <input required value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="USD" className="input-field uppercase" />
          </Field>
        </div>
        <Field label="Effective From">
          <input type="date" required value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="input-field" />
        </Field>
        <Field label="Change Reason (required)">
          <input required value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="e.g. Annual review uplift" className="input-field" />
        </Field>
        {error && <Banner kind="error">{error}</Banner>}
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
            {saving ? <SpinningDots size="sm" /> : <Plus size={14} />} Create Rate
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Cost Pools Panel ───────────────────────────────────────────────────────────

function CostPoolsPanel({ periodId, countries, disabled }: { periodId: string; countries: Country[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [pools, setPools] = useState<CostPool[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const [newCountry, setNewCountry] = useState('');

  const loadPools = useCallback(() => {
    setLoading(true); setError(null); setSavedHint(false);
    api.get<CostPool[]>(`/payroll/periods/${periodId}/cost-pools`)
      .then(setPools)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load cost pools.'))
      .finally(() => setLoading(false));
  }, [periodId]);

  useEffect(() => { if (open) loadPools(); }, [open, loadPools]);

  const usedCountries = new Set(pools.map((p) => p.country));
  const availableCountries = countries.filter((c) => !usedCountries.has(c.name));

  function updatePool(index: number, patch: Partial<CostPool>) {
    setPools((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addCountry() {
    if (!newCountry) return;
    setPools((prev) => [...prev, { country: newCountry, transfer_cost_total: '0', external_cost_total: '0', note: '' }]);
    setNewCountry('');
  }

  async function handleSave() {
    setSaving(true); setError(null); setSavedHint(false);
    try {
      const saved = await api.put<CostPool[]>(`/payroll/periods/${periodId}/cost-pools`,
        pools.map((p) => ({
          country: p.country,
          transfer_cost_total: Number(p.transfer_cost_total),
          external_cost_total: Number(p.external_cost_total),
          note: p.note || undefined,
        })),
      );
      if (Array.isArray(saved)) setPools(saved);
      setSavedHint(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save cost pools.');
    } finally { setSaving(false); }
  }

  return (
    <div className="glass-panel overflow-hidden mb-6">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={15} className="text-theme-muted" /> : <ChevronRight size={15} className="text-theme-muted" />}
          <h2 className="text-sm font-bold text-theme-heading">Cost Pools</h2>
          <span className="text-xs text-theme-muted">— per-country transfer / external cost totals, allocated across workers by hours</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-white/[0.06] pt-4">
          {loading ? (
            <div className="flex justify-center py-8"><SpinningDots className="text-emerald-accent" /></div>
          ) : (
            <>
              {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
              {savedHint && (
                <Banner kind="info" onDismiss={() => setSavedHint(false)}>
                  Cost pools saved. Re-run <strong>Calculate</strong> to apply pools to this period&apos;s payslips.
                </Banner>
              )}

              {pools.length === 0 ? (
                <p className="text-sm text-theme-muted mb-4">No cost pools defined for this period yet. Add a country below.</p>
              ) : (
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['Country', 'Transfer Cost Total', 'External Cost Total', 'Note', ''].map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-theme-muted">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pools.map((p, i) => (
                        <tr key={p.country} className="border-b border-white/[0.04] last:border-0">
                          <td className="px-3 py-2 font-medium text-theme-heading">{p.country}</td>
                          <td className="px-3 py-2">
                            <input type="number" step="0.01" min="0" disabled={disabled}
                              value={String(p.transfer_cost_total)}
                              onChange={(e) => updatePool(i, { transfer_cost_total: e.target.value })}
                              className="input-field !py-1.5 w-32" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" step="0.01" min="0" disabled={disabled}
                              value={String(p.external_cost_total)}
                              onChange={(e) => updatePool(i, { external_cost_total: e.target.value })}
                              className="input-field !py-1.5 w-32" />
                          </td>
                          <td className="px-3 py-2">
                            <input disabled={disabled} value={p.note ?? ''}
                              onChange={(e) => updatePool(i, { note: e.target.value })}
                              placeholder="Optional note" className="input-field !py-1.5 w-full min-w-[10rem]" />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" disabled={disabled}
                              onClick={() => setPools((prev) => prev.filter((_, j) => j !== i))}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-danger transition-colors disabled:opacity-40"
                              title="Remove row (removed on save)">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <select value={newCountry} onChange={(e) => setNewCountry(e.target.value)} disabled={disabled}
                    className="input-field appearance-none pr-8 !py-2 w-52">
                    <option value="">Add country…</option>
                    {availableCountries.map((c) => (
                      <option key={c.name} value={c.name}>{c.name} ({c.currency_code})</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                </div>
                <button type="button" onClick={addCountry} disabled={!newCountry || disabled}
                  className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5 disabled:opacity-50">
                  <Plus size={13} /> Add
                </button>
                <div className="flex-1" />
                <button type="button" onClick={handleSave} disabled={saving || disabled}
                  className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
                  {saving ? <SpinningDots size="sm" /> : <CheckCircle size={14} />} Save Cost Pools
                </button>
              </div>
              {disabled && (
                <p className="text-[11px] text-theme-muted mt-3">Cost pools are locked once the period is approved or paid. Reopen the period to edit.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type WorkbenchTab = 'summaries' | 'rates';

export default function PayrollWorkbenchPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [showNewPeriod, setShowNewPeriod] = useState(false);

  const [ledger, setLedger] = useState<PayRow[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [summariesError, setSummariesError] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<PayRow | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const [audience, setAudience] = useState<'all' | 'gs' | 'partners'>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [countries, setCountries] = useState<Country[]>([]);
  const [workers, setWorkers] = useState<WorkerLite[]>([]);

  const [rates, setRates] = useState<RateEntry[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [showNewRate, setShowNewRate] = useState(false);

  const [tab, setTab] = useState<WorkbenchTab>('summaries');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? null;

  // ── Loading ──

  const loadPeriods = useCallback(async (selectId?: string) => {
    setPeriodsLoading(true); setPeriodsError(null);
    try {
      const list = await api.get<PayrollPeriod[]>('/payroll/periods');
      setPeriods(list);
      setSelectedPeriodId((prev) => selectId ?? (prev && list.some((p) => p.id === prev) ? prev : list[0]?.id ?? null));
    } catch (e: unknown) {
      setPeriodsError(e instanceof Error ? e.message : 'Failed to load payroll periods.');
    } finally { setPeriodsLoading(false); }
  }, []);

  // The ledger lists every active worker, so people with no approved sessions
  // yet still show up and can be paid.
  const loadSummaries = useCallback(async (periodId: string) => {
    setSummariesLoading(true); setSummariesError(null);
    try {
      setLedger(await api.get<PayRow[]>(`/payroll/periods/${periodId}/ledger`));
    } catch (e: unknown) {
      setSummariesError(e instanceof Error ? e.message : 'Failed to load payslip rows.');
    } finally { setSummariesLoading(false); }
  }, []);

  const loadRates = useCallback(async () => {
    setRatesLoading(true); setRatesError(null);
    try {
      setRates(await api.get<RateEntry[]>('/rates'));
    } catch (e: unknown) {
      setRatesError(e instanceof Error ? e.message : 'Failed to load rates.');
    } finally { setRatesLoading(false); }
  }, []);

  useEffect(() => {
    loadPeriods();
    api.get<Country[]>('/currencies/countries').then(setCountries).catch(() => {});
    api.get<WorkerLite[]>('/workers').then(setWorkers).catch(() => {});
  }, [loadPeriods]);

  useEffect(() => {
    if (selectedPeriodId) loadSummaries(selectedPeriodId);
    else setLedger([]);
    setActionMessage(null);
    setSelectedIds(new Set());
  }, [selectedPeriodId, loadSummaries]);

  useEffect(() => { if (tab === 'rates' && rates.length === 0) loadRates(); }, [tab, rates.length, loadRates]);

  // ── Workflow actions ──

  async function runAction(action: 'calculate' | 'approve' | 'reopen' | 'push-wallets' | 'mark-paid') {
    if (!selectedPeriod) return;
    const confirmations: Partial<Record<typeof action, string>> = {
      'approve': `Approve "${selectedPeriod.label}"? This freezes FX rates at pay day.`,
      'push-wallets': `Push "${selectedPeriod.label}" payouts to worker wallets? Credits are idempotent.`,
      'mark-paid': `Mark "${selectedPeriod.label}" as paid? Reopening is no longer possible after this.`,
    };
    const msg = confirmations[action];
    if (msg && !window.confirm(msg)) return;

    setActionBusy(action); setActionMessage(null);
    try {
      const result = await api.post<Record<string, unknown> | null>(`/payroll/periods/${selectedPeriod.id}/${action}`, undefined);
      let text = '';
      switch (action) {
        case 'calculate': text = 'Period calculated. Payslip rows refreshed below.'; break;
        case 'approve': text = 'Period approved — FX rates frozen at pay day.'; break;
        case 'reopen': text = 'Period reopened for adjustments.'; break;
        case 'push-wallets': {
          const r = result as { credited?: number; skipped?: number } | null;
          text = `Wallets pushed — ${r?.credited ?? 0} credited, ${r?.skipped ?? 0} skipped (already credited).`;
          break;
        }
        case 'mark-paid': text = 'Period marked as paid.'; break;
      }
      setActionMessage({ kind: 'success', text });
      await loadPeriods(selectedPeriod.id);
      await loadSummaries(selectedPeriod.id);
    } catch (e: unknown) {
      setActionMessage({ kind: 'error', text: e instanceof Error ? e.message : `Failed to ${action.replace('-', ' ')}.` });
    } finally { setActionBusy(null); }
  }

  async function handlePayslipDownload(summaryId: string, workerName: string) {
    setDownloadingId(summaryId);
    try {
      await downloadFile(`/payroll/summaries/${summaryId}/payslip.pdf`, `payslip-${workerName.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    } catch (e: unknown) {
      setActionMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Payslip download failed.' });
    } finally { setDownloadingId(null); }
  }

  // ── Derived KPIs (payslip rows only) ──

  const kpis = useMemo(() => {
    const paid = ledger.map((r) => r.summary).filter((s): s is NonNullable<PayRow['summary']> => s !== null);
    const totalHours = paid.reduce((sum, r) => sum + Number(r.hours_logged ?? 0), 0);
    // base_equivalent is final_net converted to the period's reporting currency;
    // derive gross in reporting currency using each row's net→base ratio.
    const totalNet = paid.reduce((sum, r) => sum + Number(r.base_equivalent ?? 0), 0);
    const totalGross = paid.reduce((sum, r) => {
      const net = Number(r.final_net ?? 0);
      const ratio = net !== 0 ? Number(r.base_equivalent ?? 0) / net : 0;
      return sum + Number(r.gross_earned ?? 0) * ratio;
    }, 0);
    return { workers: paid.length, totalHours, totalGross, totalNet };
  }, [ledger]);

  // ── Audience filter + search ──

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledger.filter((r) => {
      if (audience === 'partners' && r.worker_type !== 'partner_worker') return false;
      if (audience === 'gs' && r.worker_type === 'partner_worker') return false;
      if (!q) return true;
      return (
        r.worker_display_name.toLowerCase().includes(q) ||
        r.worker_country.toLowerCase().includes(q) ||
        (r.worker_pay_tier || '').toLowerCase().includes(q)
      );
    });
  }, [ledger, audience, search]);

  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedIds.has(r.worker_id));

  function toggleRow(workerId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleRows.forEach((r) => next.delete(r.worker_id));
      else visibleRows.forEach((r) => next.add(r.worker_id));
      return next;
    });
  }

  const status = selectedPeriod?.status;
  const canCalculate = status === 'open' || status === 'calculated';
  const canApprove = status === 'calculated';
  const canReopen = status === 'calculated' || status === 'approved';
  const canPush = status === 'approved';
  const canMarkPaid = status === 'approved';
  const summariesLocked = status === 'approved' || status === 'paid';

  const baseCur = selectedPeriod?.currency ?? 'USD';

  const rateRows = rates.map((r) => {
    const worker = r.worker_id ? workers.find((w) => w.id === r.worker_id) : null;
    return {
      target: worker ? worker.display_name : r.worker_id ? `${r.worker_id.slice(0, 8)}…` : (r.pay_tier ?? '—'),
      kind: r.worker_id ? 'Worker' : 'Pay Tier',
      amount: `${fmt(r.amount)} ${r.currency}/hr`,
      effective: `${new Date(r.effective_from).toLocaleDateString()}${r.effective_to ? ` → ${new Date(r.effective_to).toLocaleDateString()}` : ' → present'}`,
      reason: r.change_reason ?? '—',
      created: new Date(r.created_at).toLocaleDateString(),
    };
  }) as unknown as Record<string, unknown>[];

  // ── Render ──

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Period ledger (anytime), payment tiers, calculate seed, approve, wallets, and receipts — one finance bundle."
        actions={
          <button type="button" onClick={() => setShowNewPeriod(true)} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
            <Plus size={15} /> New Working Month
          </button>
        }
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      {/* ── Period selector ── */}
      {periodsLoading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : periodsError ? (
        <Banner kind="error">{periodsError}</Banner>
      ) : periods.length === 0 ? (
        <div className="glass-panel p-10 text-center">
          <p className="text-theme-muted text-sm mb-4">No working months yet. Create your first period to get started.</p>
          <button type="button" onClick={() => setShowNewPeriod(true)} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
            <Plus size={15} /> New Working Month
          </button>
        </div>
      ) : (
        <>
          <PeriodFilter
            periods={periods}
            value={selectedPeriodId ?? ''}
            onChange={setSelectedPeriodId}
            variant="chips"
            label="Working month"
          />

          {selectedPeriod && (
            <>
              {/* ── Action bar ── */}
              <div className="glass-panel p-4 mb-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="mr-2">
                    <PeriodNameEditor
                      period={selectedPeriod}
                      trailing={<PeriodStatusChip status={selectedPeriod.status} />}
                      onRenamed={(label) => setPeriods((prev) =>
                        prev.map((p) => (p.id === selectedPeriod.id ? { ...p, label } : p)))}
                      onDeleted={() => {
                        const idx = periods.findIndex((p) => p.id === selectedPeriod.id);
                        const fallback = periods[idx + 1] ?? periods[idx - 1];
                        void loadPeriods(fallback?.id);
                      }}
                    />
                    <p className="text-[11px] text-theme-muted">
                      {new Date(selectedPeriod.start_date).toLocaleDateString()} – {new Date(selectedPeriod.end_date).toLocaleDateString()} · reporting in {selectedPeriod.currency}
                      {' · '}Seed from sessions adds up each worker’s finished session hours for these dates, then you enter a rate.
                    </p>
                  </div>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setShowLedger(true)}
                    className="btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5"
                  >
                    <Table2 size={13} /> Open ledger
                  </button>
                  {([
                    { action: 'calculate' as const, label: status === 'calculated' ? 'Recalculate' : 'Seed from sessions', icon: Calculator, enabled: canCalculate, primary: false, title: 'Pull every finished session in this work period, add up hours per worker, and build payslip rows. Then enter a rate — pay is hours × rate.' },
                    { action: 'approve' as const, label: 'Approve', icon: CheckCircle, enabled: canApprove, primary: status === 'calculated' },
                    { action: 'reopen' as const, label: 'Reopen', icon: RotateCcw, enabled: canReopen, primary: false },
                    { action: 'push-wallets' as const, label: 'Push to Wallets', icon: Wallet, enabled: canPush, primary: status === 'approved' && !selectedPeriod.wallet_pushed_at },
                    { action: 'mark-paid' as const, label: 'Mark Paid', icon: Send, enabled: canMarkPaid, primary: status === 'approved' && !!selectedPeriod.wallet_pushed_at },
                  ]).map(({ action, label, icon: Icon, enabled, primary, title }) => (
                    <button key={action} type="button" onClick={() => runAction(action)}
                      disabled={!enabled || actionBusy !== null}
                      title={title}
                      className={`${primary ? 'btn-primary' : 'btn-secondary'} text-xs py-2 px-3.5 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed`}>
                      {actionBusy === action ? <SpinningDots size="sm" /> : <Icon size={13} />}
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-theme-muted">
                  {selectedPeriod.approved_by && <span>Approved by: {selectedPeriod.approved_by}</span>}
                  {selectedPeriod.wallet_pushed_at && <span>Wallets pushed: {new Date(selectedPeriod.wallet_pushed_at).toLocaleString()}</span>}
                  {selectedPeriod.paid_at && <span>Paid: {new Date(selectedPeriod.paid_at).toLocaleString()}</span>}
                </div>
              </div>

              {actionMessage && (
                <Banner kind={actionMessage.kind} onDismiss={() => setActionMessage(null)}>{actionMessage.text}</Banner>
              )}

              {/* ── KPI cards ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <KpiCard label="Workers" value={kpis.workers} icon={Users} />
                <KpiCard label="Total Hours" value={kpis.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} icon={Clock} accent="blue" />
                <KpiCard label={`Total Gross (${baseCur})`} value={fmt(kpis.totalGross)} icon={DollarSign} accent="gold" />
                <KpiCard label={`Total Net (${baseCur})`} value={fmt(kpis.totalNet)} icon={Wallet} accent="emerald" highlight />
              </div>

              {/* ── Tab bar ── */}
              <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 w-fit mb-5">
                {([['summaries', 'Payslips'], ['rates', 'Rates']] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setTab(key)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      tab === key ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-theme-heading'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Summaries tab ── */}
              {tab === 'summaries' && (
                <>
                  {!summariesLocked && (
                    <ApplyToManyPanel
                      periodId={selectedPeriod.id}
                      periodLabel={selectedPeriod.label}
                      periodCurrency={selectedPeriod.currency}
                      rows={visibleRows}
                      selectedIds={selectedIds}
                      onApplied={(count) => {
                        setActionMessage({ kind: 'success', text: `Applied to ${count} worker${count === 1 ? '' : 's'}.` });
                        loadSummaries(selectedPeriod.id);
                        loadPeriods(selectedPeriod.id);
                      }}
                      onError={(text) => setActionMessage({ kind: 'error', text })}
                    />
                  )}

                  <CostPoolsPanel periodId={selectedPeriod.id} countries={countries} disabled={summariesLocked} />

                  {/* ── Audience filter + search ── */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1">
                      {([['all', 'All'], ['gs', 'GS only'], ['partners', 'Partners only']] as const).map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setAudience(key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            audience === key ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-theme-heading'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search workers…" className="input-field !py-1.5 text-sm w-full max-w-xs" />
                    <div className="flex-1" />
                    <p className="text-[11px] text-theme-muted">
                      {visibleRows.length} worker{visibleRows.length === 1 ? '' : 's'}
                      {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
                    </p>
                  </div>

                  {summariesLoading ? (
                    <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
                  ) : summariesError ? (
                    <Banner kind="error">{summariesError}</Banner>
                  ) : (
                    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                              <th className="px-3 py-3 w-9">
                                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                                  aria-label="Select all visible workers" className="accent-emerald-400" />
                              </th>
                              {['Worker', 'Hours', 'Rate/hr', 'Base Pay', 'Bonus', 'Gross', 'Deductions', 'Final Net', 'Currency', 'Flags', ''].map((h, i) => (
                                <th key={h || `col-${i}`}
                                  className={`px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted whitespace-nowrap ${
                                    i === 0 || i >= 9 ? 'text-left' : 'text-right'
                                  }`}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {visibleRows.length === 0 && (
                              <tr>
                                <td colSpan={12} className="px-4 py-10 text-center text-theme-muted text-sm">
                                  No workers match this filter.
                                </td>
                              </tr>
                            )}
                            {visibleRows.map((r) => {
                              const s = r.summary;
                              const cur = s?.local_currency ?? '—';
                              return (
                                <tr key={r.worker_id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                  <td className="px-3 py-2.5">
                                    <input type="checkbox" checked={selectedIds.has(r.worker_id)}
                                      onChange={() => toggleRow(r.worker_id)}
                                      aria-label={`Select ${r.worker_display_name}`} className="accent-emerald-400" />
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <p className="font-medium text-theme-heading">{r.worker_display_name}</p>
                                    <p className="text-[11px] text-theme-muted">
                                      {r.worker_country} · {r.worker_type === 'partner_worker' ? 'Partner' : 'GS'}
                                      {r.worker_pay_tier ? ` · ${r.worker_pay_tier}` : ''}
                                    </p>
                                  </td>
                                  {s ? (
                                    <>
                                      <td className="px-3 py-2.5 text-right tabular-nums text-theme-heading">
                                        {Number(s.hours_logged ?? r.suggested_hours ?? 0).toFixed(2)}
                                        {(r.session_count ?? 0) > 0 && (
                                          <span className="block text-[10px] font-normal text-theme-muted">
                                            {r.session_count} session{r.session_count === 1 ? '' : 's'}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 text-right tabular-nums text-theme-heading">{fmt(s.rate_per_hour)}</td>
                                      <td className="px-3 py-2.5 text-right tabular-nums text-theme-heading">{fmt(s.base_pay)}</td>
                                      <td className="px-3 py-2.5 text-right tabular-nums text-theme-heading">{fmt(s.bonus)}</td>
                                      <td className="px-3 py-2.5 text-right tabular-nums text-theme-heading">{fmt(s.gross_earned)}</td>
                                      <td className="px-3 py-2.5 text-right tabular-nums text-theme-muted">{fmt(s.total_deductions)}</td>
                                      <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${
                                        Number(s.final_net) < 0 ? 'text-danger' : 'text-emerald-accent'
                                      }`}>
                                        {fmt(s.final_net)}
                                      </td>
                                      <td className="px-3 py-2.5 text-left font-mono text-[11px] text-theme-muted">{cur}</td>
                                      <td className="px-3 py-2.5"><FlagChips flags={s.exception_flags ?? []} /></td>
                                    </>
                                  ) : (
                                    <td colSpan={9} className="px-3 py-2.5 text-[11px] text-theme-muted">
                                      No payslip row yet — {Number(r.suggested_hours ?? 0).toFixed(2)} h
                                      {(r.session_count ?? 0) > 0 ? ` from ${r.session_count} sessions` : ' of evidence'}.
                                      {' '}Open the eye and enter a rate.
                                    </td>
                                  )}
                                  <td className="px-3 py-2.5 text-right">
                                    <button type="button" onClick={() => setDetailRow(r)}
                                      title={summariesLocked ? 'View payslip detail' : 'View and edit payslip detail'}
                                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                                      style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                                      <Eye size={13} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {status === 'open' && ledger.every((r) => !r.summary) && (
                        <p className="px-4 py-3 text-[11px] text-theme-muted border-t border-white/[0.06]">
                          Nothing calculated yet. Run <strong>Seed from sessions</strong>, or pay someone directly through the eye.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── Rates tab ── */}
              {tab === 'rates' && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-theme-muted">
                      Hourly rate table — rates apply per worker or per pay tier from their effective date.
                    </p>
                    <button type="button" onClick={() => setShowNewRate(true)} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
                      <Plus size={14} /> New Rate
                    </button>
                  </div>
                  {ratesLoading ? (
                    <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
                  ) : ratesError ? (
                    <Banner kind="error">{ratesError}</Banner>
                  ) : (
                    <DataTable
                      columns={[
                        { key: 'target', header: 'Target' },
                        {
                          key: 'kind', header: 'Scope',
                          render: (r) => (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              r.kind === 'Worker'
                                ? 'bg-emerald-accent/15 text-emerald-accent border-emerald-accent/30'
                                : 'bg-gold-accent/15 text-gold-accent border-gold-accent/30'
                            }`}>{r.kind as string}</span>
                          ),
                        },
                        { key: 'amount', header: 'Rate' },
                        { key: 'effective', header: 'Effective' },
                        { key: 'reason', header: 'Change Reason' },
                        { key: 'created', header: 'Created' },
                      ]}
                      data={rateRows}
                      emptyMessage="No rate entries yet. Create one with the New Rate button."
                    />
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── Modals ── */}
      {showNewPeriod && (
        <NewPeriodModal
          onClose={() => setShowNewPeriod(false)}
          onCreated={(p) => { setShowNewPeriod(false); loadPeriods(p.id); }}
        />
      )}
      {detailRow && selectedPeriod && (
        <WorkerPayModal
          row={detailRow}
          periodId={selectedPeriod.id}
          periodLabel={selectedPeriod.label}
          periodCurrency={selectedPeriod.currency}
          defaultCurrency={
            countries.find((c) => c.name === detailRow.worker_country)?.currency_code ?? selectedPeriod.currency
          }
          locked={summariesLocked}
          onClose={() => setDetailRow(null)}
          onSaved={() => {
            loadSummaries(selectedPeriod.id);
            loadPeriods(selectedPeriod.id);
          }}
          onDownloadPayslip={(summaryId) => handlePayslipDownload(summaryId, detailRow.worker_display_name)}
        />
      )}
      {showNewRate && (
        <NewRateModal
          workers={workers}
          onClose={() => setShowNewRate(false)}
          onCreated={() => { setShowNewRate(false); loadRates(); }}
        />
      )}
      {showLedger && selectedPeriod && (
        <PeriodLedgerModal
          periodId={selectedPeriod.id}
          periodLabel={selectedPeriod.label}
          locked={summariesLocked}
          onClose={() => setShowLedger(false)}
          onSaved={() => {
            if (selectedPeriodId) loadSummaries(selectedPeriodId);
            if (selectedPeriodId) loadPeriods(selectedPeriodId);
          }}
        />
      )}
    </div>
  );
}
