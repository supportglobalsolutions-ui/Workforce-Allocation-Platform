'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Calculator, CheckCircle, ChevronDown, ChevronRight, Clock,
  DollarSign, Download, FileText, Pencil, Plus, RotateCcw, Send, Trash2,
  Users, Wallet, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import DataTable from '@/components/platform/DataTable';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
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

interface PayrollSummary {
  id: string;
  worker_id: string;
  worker_display_name: string;
  worker_country: string;
  worker_email: string | null;
  worker_type: string;
  hours_logged: string | number;
  rate_per_hour: string | number;
  base_pay: string | number;
  bonus: string | number;
  gross_earned: string | number;
  transfer_cost: string | number;
  external_cost: string | number;
  total_deductions: string | number;
  final_net: string | number;
  local_currency: string;
  fx_rate: string | number | null;
  base_currency: string;
  base_equivalent: string | number;
  exception_flags: string[];
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

const TYPE_LABELS: Record<string, string> = {
  gs_registered: 'GS Member',
  partner_worker: 'Partner',
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

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

// ── New Period Modal ───────────────────────────────────────────────────────────

function NewPeriodModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: PayrollPeriod) => void }) {
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'GBP'>('USD');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const created = await api.post<PayrollPeriod>('/payroll/periods', {
        label, start_date: startDate, end_date: endDate, currency, status: 'open',
      });
      onCreated(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create period.');
    } finally { setSaving(false); }
  }

  return (
    <ModalShell title="New Payroll Period" subtitle="Create an open period ready for calculation." onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Label">
          <input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder='e.g. "January 2026"' className="input-field" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start Date">
            <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field" />
          </Field>
          <Field label="End Date">
            <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field" />
          </Field>
        </div>
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
            {saving ? <SpinningDots size="sm" /> : <Plus size={14} />} Create Period
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Edit Summary Modal ─────────────────────────────────────────────────────────

function EditSummaryModal({ summary, onClose, onSaved }: {
  summary: PayrollSummary; onClose: () => void; onSaved: (updated: PayrollSummary) => void;
}) {
  const [form, setForm] = useState({
    hours_logged: String(summary.hours_logged ?? ''),
    rate_per_hour: String(summary.rate_per_hour ?? ''),
    bonus: String(summary.bonus ?? ''),
    transfer_cost: String(summary.transfer_cost ?? ''),
    external_cost: String(summary.external_cost ?? ''),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const updated = await api.patch<PayrollSummary>(`/payroll/summaries/${summary.id}`, {
        hours_logged: Number(form.hours_logged),
        rate_per_hour: Number(form.rate_per_hour),
        bonus: Number(form.bonus),
        transfer_cost: Number(form.transfer_cost),
        external_cost: Number(form.external_cost),
      });
      onSaved(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update payslip row.');
    } finally { setSaving(false); }
  }

  return (
    <ModalShell title={`Edit — ${summary.worker_display_name}`}
      subtitle="Gross, deductions and net are recomputed server-side." onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Hours Logged">
            <input type="number" step="0.01" min="0" required value={form.hours_logged} onChange={set('hours_logged')} className="input-field" />
          </Field>
          <Field label={`Rate / hr (${summary.local_currency})`}>
            <input type="number" step="0.01" min="0" required value={form.rate_per_hour} onChange={set('rate_per_hour')} className="input-field" />
          </Field>
          <Field label={`Bonus (${summary.local_currency})`}>
            <input type="number" step="0.01" required value={form.bonus} onChange={set('bonus')} className="input-field" />
          </Field>
          <Field label={`Transfer Cost (${summary.local_currency})`}>
            <input type="number" step="0.01" min="0" required value={form.transfer_cost} onChange={set('transfer_cost')} className="input-field" />
          </Field>
          <Field label={`External Cost (${summary.local_currency})`}>
            <input type="number" step="0.01" min="0" required value={form.external_cost} onChange={set('external_cost')} className="input-field" />
          </Field>
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
            {saving ? <SpinningDots size="sm" /> : <Pencil size={13} />} Save Changes
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
          <div className="grid grid-cols-2 gap-2">
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
        <div className="grid grid-cols-2 gap-4">
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

  const [summaries, setSummaries] = useState<PayrollSummary[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [summariesError, setSummariesError] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState<PayrollSummary | null>(null);

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

  const loadSummaries = useCallback(async (periodId: string) => {
    setSummariesLoading(true); setSummariesError(null);
    try {
      setSummaries(await api.get<PayrollSummary[]>(`/payroll/periods/${periodId}/summaries`));
    } catch (e: unknown) {
      setSummariesError(e instanceof Error ? e.message : 'Failed to load payslip summaries.');
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
    else setSummaries([]);
    setActionMessage(null);
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

  async function handlePayslipDownload(s: PayrollSummary) {
    setDownloadingId(s.id);
    try {
      await downloadFile(`/payroll/summaries/${s.id}/payslip.pdf`, `payslip-${s.worker_display_name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    } catch (e: unknown) {
      setActionMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Payslip download failed.' });
    } finally { setDownloadingId(null); }
  }

  // ── Derived KPIs ──

  const kpis = useMemo(() => {
    const totalHours = summaries.reduce((s, r) => s + Number(r.hours_logged ?? 0), 0);
    // base_equivalent is final_net converted to the period's reporting currency;
    // derive gross in reporting currency using each row's net→base ratio.
    const totalNet = summaries.reduce((s, r) => s + Number(r.base_equivalent ?? 0), 0);
    const totalGross = summaries.reduce((s, r) => {
      const net = Number(r.final_net ?? 0);
      const ratio = net !== 0 ? Number(r.base_equivalent ?? 0) / net : 0;
      return s + Number(r.gross_earned ?? 0) * ratio;
    }, 0);
    return { workers: summaries.length, totalHours, totalGross, totalNet };
  }, [summaries]);

  const status = selectedPeriod?.status;
  const canCalculate = status === 'open' || status === 'calculated';
  const canApprove = status === 'calculated';
  const canReopen = status === 'calculated' || status === 'approved';
  const canPush = status === 'approved';
  const canMarkPaid = status === 'approved';
  const summariesLocked = status === 'approved' || status === 'paid';

  const baseCur = selectedPeriod?.currency ?? 'USD';

  const summaryRows = summaries.map((s) => ({ ...s, _s: s })) as unknown as Record<string, unknown>[];

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
        title="Payroll Workbench"
        description="Run the payroll workflow end-to-end: calculate, adjust costs, approve, push to wallets, and mark paid."
        actions={
          <button type="button" onClick={() => setShowNewPeriod(true)} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
            <Plus size={15} /> New Period
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
          <p className="text-theme-muted text-sm mb-4">No payroll periods yet. Create your first period to get started.</p>
          <button type="button" onClick={() => setShowNewPeriod(true)} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
            <Plus size={15} /> New Period
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {periods.map((p) => (
              <button key={p.id} type="button" onClick={() => setSelectedPeriodId(p.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                  p.id === selectedPeriodId
                    ? 'border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent'
                    : 'border-white/10 text-theme-muted hover:text-theme-heading hover:border-emerald-accent/20'
                }`}>
                {p.label}
                <PeriodStatusChip status={p.status} />
              </button>
            ))}
          </div>

          {selectedPeriod && (
            <>
              {/* ── Action bar ── */}
              <div className="glass-panel p-4 mb-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="mr-2">
                    <p className="text-xs font-bold text-theme-heading">{selectedPeriod.label}</p>
                    <p className="text-[11px] text-theme-muted">
                      {new Date(selectedPeriod.start_date).toLocaleDateString()} – {new Date(selectedPeriod.end_date).toLocaleDateString()} · reporting in {selectedPeriod.currency}
                    </p>
                  </div>
                  <div className="flex-1" />
                  {([
                    { action: 'calculate' as const, label: status === 'calculated' ? 'Recalculate' : 'Calculate', icon: Calculator, enabled: canCalculate, primary: status === 'open' },
                    { action: 'approve' as const, label: 'Approve', icon: CheckCircle, enabled: canApprove, primary: status === 'calculated' },
                    { action: 'reopen' as const, label: 'Reopen', icon: RotateCcw, enabled: canReopen, primary: false },
                    { action: 'push-wallets' as const, label: 'Push to Wallets', icon: Wallet, enabled: canPush, primary: status === 'approved' && !selectedPeriod.wallet_pushed_at },
                    { action: 'mark-paid' as const, label: 'Mark Paid', icon: Send, enabled: canMarkPaid, primary: status === 'approved' && !!selectedPeriod.wallet_pushed_at },
                  ]).map(({ action, label, icon: Icon, enabled, primary }) => (
                    <button key={action} type="button" onClick={() => runAction(action)}
                      disabled={!enabled || actionBusy !== null}
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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
                  <CostPoolsPanel periodId={selectedPeriod.id} countries={countries} disabled={summariesLocked} />

                  {summariesLoading ? (
                    <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
                  ) : summariesError ? (
                    <Banner kind="error">{summariesError}</Banner>
                  ) : (
                    <DataTable
                      columns={[
                        {
                          key: 'worker_display_name', header: 'Worker',
                          render: (r) => (
                            <div>
                              <p className="font-medium text-theme-heading">{r.worker_display_name as string}</p>
                              {(r.worker_email as string | null) && <p className="text-[11px] text-theme-muted">{r.worker_email as string}</p>}
                            </div>
                          ),
                        },
                        { key: 'worker_country', header: 'Country' },
                        { key: 'worker_type', header: 'Type', render: (r) => TYPE_LABELS[r.worker_type as string] ?? (r.worker_type as string) },
                        { key: 'hours_logged', header: 'Hours', render: (r) => Number(r.hours_logged ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) },
                        { key: 'rate_per_hour', header: 'Rate/hr', render: (r) => fmt(r.rate_per_hour as string) },
                        { key: 'base_pay', header: 'Base Pay', render: (r) => fmt(r.base_pay as string) },
                        { key: 'bonus', header: 'Bonus', render: (r) => fmt(r.bonus as string) },
                        { key: 'gross_earned', header: 'Gross', render: (r) => fmt(r.gross_earned as string) },
                        { key: 'transfer_cost', header: 'Transfer', render: (r) => fmt(r.transfer_cost as string) },
                        { key: 'external_cost', header: 'External', render: (r) => fmt(r.external_cost as string) },
                        { key: 'total_deductions', header: 'Deductions', render: (r) => fmt(r.total_deductions as string) },
                        {
                          key: 'final_net', header: 'Final Net',
                          render: (r) => (
                            <span className={`font-bold ${Number(r.final_net) < 0 ? 'text-danger' : 'text-emerald-accent'}`}>
                              {fmt(r.final_net as string)}
                            </span>
                          ),
                        },
                        { key: 'local_currency', header: 'Local' },
                        { key: 'base_equivalent', header: `${baseCur} Equiv.`, render: (r) => <span className="text-gold-accent">{fmt(r.base_equivalent as string)}</span> },
                        { key: 'exception_flags', header: 'Flags', render: (r) => <FlagChips flags={r.exception_flags as string[]} /> },
                        {
                          key: '_actions', header: '',
                          render: (r) => {
                            const s = (r as { _s: PayrollSummary })._s;
                            return (
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => setEditSummary(s)} disabled={summariesLocked}
                                  title={summariesLocked ? 'Reopen the period to edit' : 'Edit payslip row'}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors disabled:opacity-30"
                                  style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                                  <Pencil size={13} />
                                </button>
                                <button type="button" onClick={() => handlePayslipDownload(s)} disabled={downloadingId === s.id}
                                  title="Download payslip PDF"
                                  className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                                  style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                                  {downloadingId === s.id ? <SpinningDots size="sm" /> : <FileText size={13} />}
                                </button>
                              </div>
                            );
                          },
                        },
                      ]}
                      data={summaryRows}
                      emptyMessage={status === 'open' ? 'No payslip rows yet — run Calculate to generate them.' : 'No payslip rows for this period.'}
                    />
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
      {editSummary && (
        <EditSummaryModal
          summary={editSummary}
          onClose={() => setEditSummary(null)}
          onSaved={(updated) => {
            setSummaries((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            setEditSummary(null);
          }}
        />
      )}
      {showNewRate && (
        <NewRateModal
          workers={workers}
          onClose={() => setShowNewRate(false)}
          onCreated={() => { setShowNewRate(false); loadRates(); }}
        />
      )}
    </div>
  );
}
