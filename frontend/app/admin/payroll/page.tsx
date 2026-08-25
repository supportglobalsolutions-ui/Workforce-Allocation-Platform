'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle, Calculator, Check, CheckCircle, ChevronDown, Clock,
  DollarSign, Eye, FileText, Mail, Pencil, Plus, RotateCcw, Send, Table2, Trash2,
  Users, Wallet, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import ConfirmModal, { FINANCE_CONFIRM_META } from '@/components/platform/ConfirmModal';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import PeriodLedgerModal from '@/components/admin/PeriodLedgerModal';
import ApplyToManyPanel from '@/components/admin/ApplyToManyPanel';
import WorkerPayModal, { type PayRow } from '@/components/admin/WorkerPayModal';
import PayslipEmailPanel from '@/components/payroll/PayslipEmailPanel';
import PeriodNameEditor from '@/components/payroll/PeriodNameEditor';
import PeriodFilter from '@/components/platform/PeriodFilter';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { pickCurrentPeriod } from '@/lib/periods';

type ConfirmAction = 'approve' | 'push-wallets' | 'mark-paid';

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
  is_current?: boolean;
}

interface Country { name: string; currency_code: string; is_active: boolean; }

type FinancePayRow = PayRow & {
  period_id?: string;
  period_label?: string;
  period_currency?: string;
  period_status?: PeriodStatus;
  period_start_date?: string;
  period_end_date?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (x: string | number | null | undefined) =>
  Number(x ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatCurrencyTotals(totals: Map<string, number>): string {
  if (totals.size === 0) return '0.00';
  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => `${currency} ${fmt(amount)}`)
    .join(' · ');
}

function amountInBaseCurrency(
  localAmount: number,
  summary: NonNullable<PayRow['summary']>,
  periodCurrency?: string,
): number {
  // Pay rows are stored in local_currency. KPI cards report period currency.
  // When those already match, do not divide by a leftover FX rate.
  const base = summary.base_currency || periodCurrency;
  if (summary.local_currency && base && summary.local_currency === base) {
    return localAmount;
  }
  const fx = Number(summary.fx_rate ?? 0);
  if (fx > 0) return localAmount / fx;
  const net = Number(summary.final_net ?? 0);
  return net !== 0 ? localAmount * (Number(summary.base_equivalent ?? 0) / net) : 0;
}

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



// ── Page ───────────────────────────────────────────────────────────────────────

export default function PayrollWorkbenchPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [showNewPeriod, setShowNewPeriod] = useState(false);

  const [ledger, setLedger] = useState<FinancePayRow[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [summariesError, setSummariesError] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<PayRow | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const [audience, setAudience] = useState<'all' | 'gs' | 'partners'>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [countries, setCountries] = useState<Country[]>([]);

  const [payslipsOpen, setPayslipsOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [generatingPdfs, setGeneratingPdfs] = useState(false);

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? null;
  const isAllPeriods = selectedPeriodId === '';

  function openPayslipsModal() {
    setPayslipsOpen(true);
  }

  // ── Loading ──

  const loadPeriods = useCallback(async (selectId?: string) => {
    setPeriodsLoading(true); setPeriodsError(null);
    try {
      const list = await api.get<PayrollPeriod[]>('/payroll/periods');
      setPeriods(list);
      setSelectedPeriodId((prev) => selectId ?? (
        prev !== null && (prev === '' || list.some((p) => p.id === prev))
          ? prev
          : pickCurrentPeriod(list)?.id ?? null
      ));
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

  const loadAllSummaries = useCallback(async (availablePeriods: PayrollPeriod[]) => {
    setSummariesLoading(true); setSummariesError(null);
    try {
      try {
        setLedger(await api.get<FinancePayRow[]>('/payroll/history'));
      } catch (historyError: unknown) {
        // Keep the view usable while a local backend without the new read-only
        // history route is still running; the dedicated route is used after restart.
        if (!(historyError instanceof Error) || historyError.message !== 'Not Found') throw historyError;
        const rowsByPeriod = await Promise.all(availablePeriods.map(async (period) => {
          const rows = await api.get<PayRow[]>(`/payroll/periods/${period.id}/ledger`);
          return rows
            .filter((row) => row.summary !== null)
            .map((row): FinancePayRow => ({
              ...row,
              period_id: period.id,
              period_label: period.label,
              period_currency: period.currency,
              period_status: period.status,
              period_start_date: period.start_date,
              period_end_date: period.end_date,
            }));
        }));
        setLedger(rowsByPeriod.flat());
      }
    } catch (e: unknown) {
      setSummariesError(e instanceof Error ? e.message : 'Failed to load all payslip history.');
    } finally { setSummariesLoading(false); }
  }, []);

  useEffect(() => {
    loadPeriods();
    api.get<Country[]>('/currencies/countries').then(setCountries).catch(() => {});
  }, [loadPeriods]);

  useEffect(() => {
    if (isAllPeriods) loadAllSummaries(periods);
    else if (selectedPeriodId) loadSummaries(selectedPeriodId);
    else setLedger([]);
    setActionMessage(null);
    setSelectedIds(new Set());
    setApplyOpen(false);
    setDetailRow(null);
    setPayslipsOpen(false);
    setShowLedger(false);
  }, [selectedPeriodId, isAllPeriods, periods, loadAllSummaries, loadSummaries]);

  // ── Workflow actions ──

  function requestAction(action: 'calculate' | 'approve' | 'reopen' | 'push-wallets' | 'mark-paid') {
    if (!selectedPeriod) return;
    if (action === 'approve' || action === 'push-wallets' || action === 'mark-paid') {
      setConfirmAction(action);
      return;
    }
    void executeAction(action);
  }

  async function executeAction(action: 'calculate' | 'approve' | 'reopen' | 'push-wallets' | 'mark-paid') {
    if (!selectedPeriod) return;
    setConfirmAction(null);
    setActionBusy(action);
    setActionMessage(null);
    try {
      const result = await api.post<Record<string, unknown> | null>(`/payroll/periods/${selectedPeriod.id}/${action}`, undefined);
      let text = '';
      switch (action) {
        case 'calculate': {
          const pdfs = Number((result as { pdfs?: number } | null)?.pdfs ?? 0);
          text = pdfs > 0
            ? `Period calculated. Payslip rows and ${pdfs} PDF${pdfs === 1 ? '' : 's'} ready.`
            : 'Period calculated. Payslip rows refreshed below.';
          break;
        }
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
    } finally {
      setActionBusy(null);
    }
  }

  async function handleGeneratePayslips() {
    if (!selectedPeriod) return;
    setGeneratingPdfs(true);
    setActionMessage(null);
    try {
      const result = await api.post<{ generated: number; total: number }>(
        `/payroll/periods/${selectedPeriod.id}/payslips/generate`,
        {},
      );
      setActionMessage({
        kind: 'success',
        text: `Payslip PDFs ready — ${result.total} file${result.total === 1 ? '' : 's'}.`,
      });
    } catch (e: unknown) {
      setActionMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to generate payslip PDFs.' });
    } finally {
      setGeneratingPdfs(false);
    }
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
    const periodCurrency = selectedPeriod?.currency;
    const paidRows = ledger.filter((r): r is FinancePayRow & { summary: NonNullable<PayRow['summary']> } => r.summary !== null);
    const paid = paidRows.map((r) => r.summary);
    const totalHours = paid.reduce((sum, r) => sum + Number(r.hours_logged ?? 0), 0);
    const totalGross = paid.reduce((sum, r) => sum + amountInBaseCurrency(Number(r.gross_earned ?? 0), r, periodCurrency), 0);
    const totalNet = paid.reduce((sum, r) => sum + amountInBaseCurrency(Number(r.final_net ?? 0), r, periodCurrency), 0);
    const workers = isAllPeriods ? new Set(paidRows.map((r) => r.worker_id)).size : paid.length;
    const grossByCurrency = new Map<string, number>();
    const netByCurrency = new Map<string, number>();
    if (isAllPeriods) {
      paidRows.forEach((row) => {
        const summary = row.summary;
        const currency = summary.base_currency || row.period_currency || 'USD';
        const baseGross = amountInBaseCurrency(Number(summary.gross_earned ?? 0), summary, row.period_currency);
        const baseNet = amountInBaseCurrency(Number(summary.final_net ?? 0), summary, row.period_currency);
        grossByCurrency.set(currency, (grossByCurrency.get(currency) ?? 0) + baseGross);
        netByCurrency.set(currency, (netByCurrency.get(currency) ?? 0) + baseNet);
      });
    }
    return { workers, totalHours, totalGross, totalNet, grossByCurrency, netByCurrency };
  }, [ledger, isAllPeriods, selectedPeriod?.currency]);

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

  const showFlags = useMemo(
    () => ledger.some((r) => (r.summary?.exception_flags?.length ?? 0) > 0),
    [ledger],
  );

  const colCount = 3 + (isAllPeriods ? 1 : 0) + 8 + (showFlags ? 1 : 0);
  const noSummaryColSpan = (isAllPeriods ? 1 : 0) + 8 + (showFlags ? 1 : 0);

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
  const payslipsAvailable = status !== 'open' || ledger.some((row) => row.summary);
  const allPeriodRange = useMemo(() => {
    if (periods.length === 0) return '';
    const starts = periods.map((period) => new Date(period.start_date).getTime());
    const ends = periods.map((period) => new Date(period.end_date).getTime());
    return `${new Date(Math.min(...starts)).toLocaleDateString()} – ${new Date(Math.max(...ends)).toLocaleDateString()}`;
  }, [periods]);

  const confirmMeta = confirmAction ? FINANCE_CONFIRM_META[confirmAction] : null;
  const confirmBody: ReactNode = (() => {
    if (!confirmAction || !selectedPeriod) return null;
    const label = selectedPeriod.label;
    if (confirmAction === 'approve') {
      return (
        <>
          Approve <span className="font-semibold text-theme-heading">“{label}”</span>?
          This freezes FX rates at pay day. You can still reopen later until the month is marked paid.
        </>
      );
    }
    if (confirmAction === 'push-wallets') {
      return (
        <>
          Push payouts for <span className="font-semibold text-theme-heading">“{label}”</span> to worker wallets?
          Credits are idempotent — already-credited workers are skipped.
        </>
      );
    }
    return (
      <>
        Mark <span className="font-semibold text-theme-heading">“{label}”</span> as paid?
        Reopening is no longer possible after this.
      </>
    );
  })();

  // ── Render ──

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Pay, wallets, and receipts."
        besideTitle={
          periodsLoading ? (
            <SpinningDots size="sm" className="text-emerald-accent" />
          ) : periods.length > 0 ? (
            <PeriodFilter
              periods={periods}
              value={selectedPeriodId ?? ''}
              onChange={setSelectedPeriodId}
              allowAll
              allLabel="All working months"
              variant="inline"
            />
          ) : null
        }
        actions={
          <>
            {selectedPeriod && (
              <>
                <button
                  type="button"
                  onClick={() => void handleGeneratePayslips()}
                  disabled={!payslipsAvailable || generatingPdfs}
                  title={payslipsAvailable
                    ? 'Build PDF files for every worker. Calculate also does this. Email uses these files when you attach PDFs.'
                    : 'Calculate this work period to create payslips first.'}
                  className="btn-secondary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {generatingPdfs ? <SpinningDots size="sm" /> : <FileText size={15} />} Generate payslips
                </button>
                <button
                  type="button"
                  onClick={openPayslipsModal}
                  disabled={!payslipsAvailable}
                  title={payslipsAvailable
                    ? 'Email HTML payslips for this month (optional PDF). Does not pay wallets.'
                    : 'Calculate this work period to create payslips first.'}
                  className={`text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${payslipsOpen ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <Mail size={15} /> Payslip emails
                </button>
              </>
            )}
            <button type="button" onClick={() => setShowNewPeriod(true)} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
              <Plus size={15} /> New month
            </button>
          </>
        }
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      {periodsLoading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : periodsError ? (
        <Banner kind="error">{periodsError}</Banner>
      ) : periods.length === 0 ? (
        <div className="glass-panel p-10 text-center">
          <p className="text-theme-muted text-sm mb-4">No working months yet.</p>
          <button type="button" onClick={() => setShowNewPeriod(true)} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
            <Plus size={15} /> New month
          </button>
        </div>
      ) : (
        <>
          {(selectedPeriod || isAllPeriods) && (
            <>
              {isAllPeriods && (
                <div className="glass-panel p-4 mb-5 flex flex-wrap items-center gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-theme-heading">All working months</h2>
                    <p className="text-[11px] text-theme-muted mt-0.5">
                      {allPeriodRange} · Complete payslip history across every working month
                    </p>
                  </div>
                  <div className="flex-1" />
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-blue-400/30 bg-blue-400/10 text-[10px] font-bold uppercase tracking-wider text-blue-400">
                    <Eye size={12} /> View only
                  </span>
                </div>
              )}

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
                      {new Date(selectedPeriod.start_date).toLocaleDateString()} – {new Date(selectedPeriod.end_date).toLocaleDateString()} · {selectedPeriod.currency}
                    </p>
                  </div>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setShowLedger(true)}
                    title="Bulk spreadsheet for this month: hours, rates, bonus, FX. Same people as the list below — faster for editing many rows at once."
                    className="btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5"
                  >
                    <Table2 size={13} /> Ledger
                  </button>
                  {!summariesLocked && (
                    <button
                      type="button"
                      onClick={() => setApplyOpen(true)}
                      title="Set the same rate, bonus, or currency on many workers at once."
                      className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
                    >
                      <Users size={13} /> Apply to many
                    </button>
                  )}
                  {([
                    { action: 'calculate' as const, label: status === 'calculated' ? 'Recalculate' : 'Calculate', icon: Calculator, enabled: canCalculate, primary: false, title: 'Pull finished session hours into this month. Does not pay anyone.' },
                    { action: 'approve' as const, label: 'Approve', icon: CheckCircle, enabled: canApprove, primary: status === 'calculated', title: canApprove ? 'Lock this month and freeze FX. Required before Wallets.' : 'Calculate first, then Approve.' },
                    { action: 'reopen' as const, label: 'Reopen', icon: RotateCcw, enabled: canReopen, primary: false, title: 'Unlock the month so you can edit payslips again. Does not delete rows.' },
                    { action: 'push-wallets' as const, label: 'Wallets', icon: Wallet, enabled: canPush, primary: status === 'approved' && !selectedPeriod.wallet_pushed_at, title: canPush ? 'Credit each worker wallet with this month’s net pay.' : 'Approve this month first. Entering a rate does not credit wallets.' },
                    { action: 'mark-paid' as const, label: 'Mark Paid', icon: Send, enabled: canMarkPaid, primary: status === 'approved' && !!selectedPeriod.wallet_pushed_at, title: canMarkPaid ? 'Mark the month paid after wallets are credited.' : 'Approve, then push Wallets, then Mark Paid.' },
                  ]).map(({ action, label, icon: Icon, enabled, primary, title }) => (
                    <button key={action} type="button" onClick={() => requestAction(action)}
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
                </>
              )}

              {/* ── KPI cards ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <KpiCard compact label="Workers" value={kpis.workers} icon={Users} />
                <KpiCard compact label="Hours" value={kpis.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} icon={Clock} accent="blue" />
                <KpiCard
                  compact
                  label={isAllPeriods ? 'Gross by currency' : `Gross ${baseCur}`}
                  value={isAllPeriods ? formatCurrencyTotals(kpis.grossByCurrency) : fmt(kpis.totalGross)}
                  icon={DollarSign}
                  accent="gold"
                />
                <KpiCard
                  compact
                  label={isAllPeriods ? 'Net by currency' : `Net ${baseCur}`}
                  value={isAllPeriods ? formatCurrencyTotals(kpis.netByCurrency) : fmt(kpis.totalNet)}
                  icon={Wallet}
                  accent="emerald"
                  highlight
                />
              </div>

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
                      {visibleRows.length} {isAllPeriods ? `payslip record${visibleRows.length === 1 ? '' : 's'}` : `worker${visibleRows.length === 1 ? '' : 's'}`}
                      {!isAllPeriods && selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
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
                                {!isAllPeriods && (
                                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                                    aria-label="Select all visible workers" className="accent-emerald-400" />
                                )}
                              </th>
                              {[
                                'Worker',
                                ...(isAllPeriods ? ['Period'] : []),
                                'Hours', 'Rate/hr', 'Base Pay', 'Bonus', 'Gross', 'Deductions', 'Final Net', 'Currency',
                                ...(showFlags ? ['Flags'] : []),
                                '',
                              ].map((h, i) => (
                                <th key={h || `col-${i}`}
                                  className={`px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted whitespace-nowrap ${
                                    ['Worker', 'Period', 'Currency', 'Flags', ''].includes(h) ? 'text-left' : 'text-right'
                                  }`}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {visibleRows.length === 0 && (
                              <tr>
                                <td colSpan={colCount} className="px-4 py-10 text-center text-theme-muted text-sm">
                                  {isAllPeriods ? 'No payslip history matches this filter.' : 'No workers match this filter.'}
                                </td>
                              </tr>
                            )}
                            {visibleRows.map((r) => {
                              const s = r.summary;
                              const cur = s?.local_currency ?? '—';
                              return (
                                <tr key={isAllPeriods ? `${r.period_id}:${r.worker_id}` : r.worker_id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                  <td className="px-3 py-2.5">
                                    {!isAllPeriods && (
                                      <input type="checkbox" checked={selectedIds.has(r.worker_id)}
                                        onChange={() => toggleRow(r.worker_id)}
                                        aria-label={`Select ${r.worker_display_name}`} className="accent-emerald-400" />
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <p className="font-medium text-theme-heading">{r.worker_display_name}</p>
                                    <p className="text-[11px] text-theme-muted">
                                      {r.worker_country} · {r.worker_type === 'partner_worker' ? 'Partner' : 'GS'}
                                      {r.worker_pay_tier ? ` · ${r.worker_pay_tier}` : ''}
                                    </p>
                                  </td>
                                  {isAllPeriods && (
                                    <td className="px-3 py-2.5 text-left whitespace-nowrap">
                                      <p className="text-xs font-medium text-theme-heading">{r.period_label}</p>
                                      <p className="text-[10px] font-mono text-theme-muted">
                                        {r.period_currency}{r.period_status ? ` · ${r.period_status}` : ''}
                                      </p>
                                    </td>
                                  )}
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
                                      {showFlags && (
                                        <td className="px-3 py-2.5"><FlagChips flags={s.exception_flags ?? []} /></td>
                                      )}
                                    </>
                                  ) : (
                                    <td colSpan={noSummaryColSpan} className="px-3 py-2.5 text-[11px] text-theme-muted">
                                      No payslip row yet — {Number(r.suggested_hours ?? 0).toFixed(2)} h
                                      {(r.session_count ?? 0) > 0 ? ` from ${r.session_count} sessions` : ' of evidence'}.
                                      {' '}Open the eye and enter a rate.
                                    </td>
                                  )}
                                  <td className="px-3 py-2.5 text-right">
                                    {!isAllPeriods && (
                                      <button type="button" onClick={() => setDetailRow(r)}
                                        title={summariesLocked ? 'View payslip detail' : 'View and edit payslip detail'}
                                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                                        style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                                        <Eye size={13} />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {!isAllPeriods && status === 'open' && ledger.every((r) => !r.summary) && (
                        <p className="px-4 py-3 text-[11px] text-theme-muted border-t border-white/[0.06]">
                          Nothing calculated yet. Calculate, or open a worker.
                        </p>
                      )}
                    </div>
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
      {selectedPeriod && payslipsOpen && (
        <PayslipEmailPanel
          periodId={selectedPeriod.id}
          periodLabel={selectedPeriod.label}
          disabled={status === 'open' && ledger.every((r) => !r.summary)}
          open={payslipsOpen}
          onOpenChange={setPayslipsOpen}
        />
      )}
      {applyOpen && !summariesLocked && selectedPeriod && (
        <ApplyToManyPanel
          open={applyOpen}
          onClose={() => setApplyOpen(false)}
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
      {showLedger && selectedPeriod && (
        <PeriodLedgerModal
          periodId={selectedPeriod.id}
          periodLabel={selectedPeriod.label}
          periodCurrency={selectedPeriod.currency}
          locked={summariesLocked}
          onClose={() => setShowLedger(false)}
          onSaved={() => {
            if (selectedPeriodId) loadSummaries(selectedPeriodId);
            if (selectedPeriodId) loadPeriods(selectedPeriodId);
          }}
        />
      )}
      {confirmAction && selectedPeriod && confirmMeta && (
        <ConfirmModal
          open
          title={confirmMeta.title}
          body={confirmBody}
          confirmLabel={confirmMeta.confirmLabel}
          tone={confirmMeta.tone}
          icon={confirmMeta.icon}
          busy={actionBusy === confirmAction}
          onCancel={() => { if (actionBusy !== confirmAction) setConfirmAction(null); }}
          onConfirm={() => void executeAction(confirmAction)}
        />
      )}
    </div>
  );
}
