'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Users, X } from 'lucide-react';

import ConfirmModal from '@/components/platform/ConfirmModal';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { currencyCodes, useCurrencies } from '@/lib/currencies';
import type { PayRow } from '@/components/admin/WorkerPayModal';

export type Audience = 'all' | 'gs' | 'partners' | 'selected';

interface Props {
  open: boolean;
  onClose: () => void;
  periodId: string;
  periodLabel: string;
  periodCurrency: string;
  /** Rows currently passing the page's own filter and search. */
  rows: PayRow[];
  selectedIds: Set<string>;
  onApplied: (count: number) => void;
  onError: (message: string) => void;
}

const FIELDS = [
  { key: 'rate_per_hour', label: 'Rate / hr' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'transfer_cost', label: 'Transfer' },
  { key: 'external_cost', label: 'External' },
  { key: 'fx_rate', label: 'FX' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

const AUDIENCES: { key: Audience; label: string }[] = [
  { key: 'all', label: 'All workers' },
  { key: 'gs', label: 'GS only' },
  { key: 'partners', label: 'Partners only' },
  { key: 'selected', label: 'Selected' },
];

export function audienceMembers(rows: PayRow[], audience: Audience, selectedIds: Set<string>): PayRow[] {
  switch (audience) {
    case 'gs':        return rows.filter((r) => r.worker_type !== 'partner_worker');
    case 'partners':  return rows.filter((r) => r.worker_type === 'partner_worker');
    case 'selected':  return rows.filter((r) => selectedIds.has(r.worker_id));
    default:          return rows;
  }
}

/**
 * Fill a payslip field once and push it to many workers. Only the fields you
 * typed are sent, so applying a bonus never disturbs anyone's hours.
 */
export default function ApplyToManyPanel({
  open,
  onClose,
  periodId,
  periodLabel,
  periodCurrency,
  rows,
  selectedIds,
  onApplied,
  onError,
}: Props) {
  const [audience, setAudience] = useState<Audience>('all');
  const [values, setValues] = useState<Record<FieldKey, string>>({
    rate_per_hour: '', bonus: '', transfer_cost: '', external_cost: '', fx_rate: '',
  });
  const [currency, setCurrency] = useState('');
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const currencies = useCurrencies();
  const [fxRates, setFxRates] = useState<{ id: string; base_currency: string; quote_currency: string; rate: string | number; as_of_date: string }[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    api.get<typeof fxRates>(`/currencies/rates?base=${periodCurrency}`)
      .then(setFxRates)
      .catch(() => setFxRates([]));
  }, [open, periodCurrency]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !applying && !confirmOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, applying, confirmOpen, onClose]);

  const targets = useMemo(
    () => audienceMembers(rows, audience, selectedIds),
    [rows, audience, selectedIds],
  );

  const filled = useMemo(
    () => FIELDS.filter((f) => values[f.key] !== '').map((f) => f.label),
    [values],
  );
  const hasValues = filled.length > 0 || currency !== '';

  const changeSummary = [...filled, ...(currency ? [`Currency ${currency}`] : [])].join(', ');
  const who = audience === 'selected'
    ? `${targets.length} selected worker${targets.length === 1 ? '' : 's'}`
    : `${targets.length} ${AUDIENCES.find((a) => a.key === audience)!.label.toLowerCase()}`;

  async function applyConfirmed() {
    if (!hasValues || targets.length === 0) return;
    setConfirmOpen(false);
    setApplying(true);
    try {
      await api.post(`/payroll/periods/${periodId}/summaries/bulk`, {
        upsert: true,
        rows: targets.map((r) => ({
          worker_id: r.worker_id,
          ...Object.fromEntries(
            FIELDS
              .filter((f) => values[f.key] !== '')
              // A currency switch re-resolves FX server-side, so drop any typed rate.
              .filter((f) => !(f.key === 'fx_rate' && currency !== ''))
              .map((f) => [f.key, Number(values[f.key])]),
          ),
          ...(currency ? { local_currency: currency } : {}),
          admin_locked: true,
        })),
      });
      setValues({ rate_per_hour: '', bonus: '', transfer_cost: '', external_cost: '', fx_rate: '' });
      setCurrency('');
      onApplied(targets.length);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to apply values.');
    } finally {
      setApplying(false);
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-to-many-title"
        onClick={(e) => { if (e.target === e.currentTarget && !applying) onClose(); }}
      >
        <div className="glass-modal relative z-10 w-full max-w-2xl max-h-[min(92vh,40rem)] overflow-hidden rounded-2xl border border-theme shadow-2xl flex flex-col">
          <header className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-accent/40 bg-emerald-accent/15 text-emerald-accent">
              <Users size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="apply-to-many-title" className="text-base font-bold text-theme-heading">Apply to many</h2>
              <p className="text-xs text-theme-muted mt-0.5 truncate">
                Set the same values on many workers in {periodLabel}. Only filled fields are sent.
              </p>
            </div>
            <button
              type="button"
              disabled={applying}
              onClick={onClose}
              aria-label="Close"
              className="text-theme-muted hover:text-theme-heading disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </header>

          <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="flex flex-wrap items-end gap-3">
              {FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">{f.label}</span>
                  {f.key === 'fx_rate' ? (
                    <select
                      value={values.fx_rate}
                      onChange={(e) => setValues((v) => ({ ...v, fx_rate: e.target.value }))}
                      disabled={currency !== ''}
                      className="input-field !py-1.5 w-40 text-sm disabled:opacity-50"
                    >
                      <option value="">Leave</option>
                      {fxRates
                        .filter((r, i, all) => all.findIndex((x) => x.quote_currency === r.quote_currency) === i)
                        .map((r) => (
                          <option key={r.id} value={String(r.rate)}>
                            1 {r.base_currency} = {Number(r.rate)} {r.quote_currency}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      value={values[f.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      placeholder="—"
                      className="input-field !py-1.5 w-28 text-sm"
                    />
                  )}
                </label>
              ))}
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Currency</span>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                  className="input-field !py-1.5 w-32 text-sm">
                  <option value="">Leave as is</option>
                  {currencyCodes(currencies).map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 w-fit">
              {AUDIENCES.map((a) => {
                const count = audienceMembers(rows, a.key, selectedIds).length;
                return (
                  <button key={a.key} type="button" onClick={() => setAudience(a.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      audience === a.key ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-theme-heading'
                    }`}>
                    {a.label} ({count})
                  </button>
                );
              })}
            </div>

            {!hasValues && (
              <p className="text-[11px] text-theme-muted flex items-center gap-1.5">
                <AlertCircle size={12} /> Fill at least one field, then Apply. Tick rows in the list to use Selected.
              </p>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.06] shrink-0">
            <button type="button" disabled={applying} onClick={onClose} className="btn-secondary text-sm py-2 px-4">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={applying || !hasValues || targets.length === 0}
              className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {applying ? <SpinningDots size="sm" /> : <Users size={14} />}
              Apply to {targets.length} worker{targets.length === 1 ? '' : 's'}
            </button>
          </footer>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Apply these values?"
        body={
          <>
            Apply <span className="font-semibold text-theme-heading">{changeSummary || 'changes'}</span>
            {' '}to <span className="font-semibold text-theme-heading">{who}</span> in {periodLabel}?
            Only the fields you filled will change.
          </>
        }
        confirmLabel="Apply"
        tone="primary"
        icon={Users}
        busy={applying}
        onCancel={() => { if (!applying) setConfirmOpen(false); }}
        onConfirm={() => void applyConfirmed()}
      />
    </>,
    document.body,
  );
}
