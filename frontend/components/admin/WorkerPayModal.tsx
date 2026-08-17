'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, FileText, X } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { currencyCodes, useCurrencies } from '@/lib/currencies';

export interface PayRow {
  worker_id: string;
  worker_display_name: string;
  worker_country: string;
  worker_type: string | null;
  worker_pay_tier: string | null;
  suggested_hours: string | number;
  evidence_incomplete: boolean;
  summary: {
    id: string;
    hours_logged: string | number;
    rate_per_hour: string | number;
    bonus: string | number;
    transfer_cost: string | number;
    external_cost: string | number;
    local_currency: string;
    fx_rate: string | number | null;
    // Server-derived; recomputed client-side while editing.
    base_pay: string | number;
    gross_earned: string | number;
    total_deductions: string | number;
    final_net: string | number;
    base_currency?: string | null;
    base_equivalent?: string | number | null;
    admin_locked?: boolean;
    exception_flags?: string[];
  } | null;
}

interface Props {
  row: PayRow;
  periodId: string;
  periodLabel: string;
  periodCurrency: string;
  /** Fallback pay currency when the worker has no payslip row yet. */
  defaultCurrency: string;
  locked: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDownloadPayslip?: (summaryId: string) => void;
}

type FormKey = 'hours_logged' | 'rate_per_hour' | 'bonus' | 'transfer_cost' | 'external_cost' | 'fx_rate';

const num = (v: string) => (v === '' ? 0 : Number(v) || 0);

const money = (x: number) =>
  x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Eye-click modal: the full payslip row-set for one worker, editable. */
export default function WorkerPayModal({
  row,
  periodId,
  periodLabel,
  periodCurrency,
  defaultCurrency,
  locked,
  onClose,
  onSaved,
  onDownloadPayslip,
}: Props) {
  const s = row.summary;
  const currencies = useCurrencies();

  const [form, setForm] = useState({
    hours_logged: String(s?.hours_logged ?? row.suggested_hours ?? '0'),
    rate_per_hour: String(s?.rate_per_hour ?? '0'),
    bonus: String(s?.bonus ?? '0'),
    transfer_cost: String(s?.transfer_cost ?? '0'),
    external_cost: String(s?.external_cost ?? '0'),
    fx_rate: s?.fx_rate != null ? String(s.fx_rate) : '',
  });
  const [currency, setCurrency] = useState(s?.local_currency ?? defaultCurrency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: FormKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Mirrors payroll_engine.recompute_summary so the numbers move as you type.
  const totals = useMemo(() => {
    const basePay = num(form.hours_logged) * num(form.rate_per_hour);
    const gross = basePay + num(form.bonus);
    const deductions = num(form.transfer_cost) + num(form.external_cost);
    const net = gross - deductions;
    const fx = num(form.fx_rate);
    return {
      basePay,
      gross,
      deductions,
      net,
      baseEquivalent: fx > 0 ? net / fx : null,
    };
  }, [form]);

  const currencyChanged = currency !== (s?.local_currency ?? defaultCurrency);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // The bulk endpoint upserts, so this works before Calculate has ever run.
      await api.post(`/payroll/periods/${periodId}/summaries/bulk`, {
        upsert: true,
        rows: [{
          worker_id: row.worker_id,
          hours_logged: num(form.hours_logged),
          rate_per_hour: num(form.rate_per_hour),
          bonus: num(form.bonus),
          transfer_cost: num(form.transfer_cost),
          external_cost: num(form.external_cost),
          local_currency: currency,
          // Omitting FX after a currency switch lets the server re-resolve it.
          ...(form.fx_rate !== '' && !currencyChanged ? { fx_rate: Number(form.fx_rate) } : {}),
          admin_locked: true,
        }],
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the payslip row.');
    } finally {
      setSaving(false);
    }
  }

  const lines: { label: string; value: React.ReactNode; strong?: boolean; input?: FormKey; step?: string }[] = [
    { label: 'Hours Logged', value: null, input: 'hours_logged', step: '0.01' },
    { label: 'Rate per Hour', value: null, input: 'rate_per_hour', step: '0.01' },
    { label: 'Base Pay', value: money(totals.basePay) },
    { label: 'Bonus', value: null, input: 'bonus', step: '0.01' },
    { label: 'Gross Earned', value: money(totals.gross), strong: true },
    { label: 'Transfer Cost Deduction', value: null, input: 'transfer_cost', step: '0.01' },
    { label: 'External Cost Deduction', value: null, input: 'external_cost', step: '0.01' },
    { label: 'Total Deductions', value: money(totals.deductions) },
    { label: 'Final Net Pay Due', value: money(totals.net), strong: true },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form onSubmit={save} className="glass-modal relative z-10 w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden rounded-2xl">
        <div className="flex items-start justify-between p-5 border-b border-white/[0.06] shrink-0">
          <div>
            <p className="text-base font-bold text-theme-heading">{row.worker_display_name}</p>
            <p className="text-xs text-theme-muted mt-0.5">
              {periodLabel} · {row.worker_country}
              {row.worker_pay_tier ? ` · ${row.worker_pay_tier}` : ''}
              {row.worker_type === 'partner_worker' ? ' · Partner' : ' · GS'}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Pay currency</label>
              <select value={currency} disabled={locked} onChange={(e) => setCurrency(e.target.value)}
                className="input-field !py-2 text-sm disabled:opacity-60">
                {currencyCodes(currencies, currency).map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">
                FX (1 {periodCurrency} =)
              </label>
              <input type="number" step="any" min="0" disabled={locked || currencyChanged}
                value={currencyChanged ? '' : form.fx_rate} onChange={set('fx_rate')}
                placeholder={currencyChanged ? 'Set from rate table' : 'Not set'}
                className="input-field !py-2 text-sm disabled:opacity-60" />
            </div>
          </div>

          {currencyChanged && (
            <p className="text-[11px] text-gold-accent">
              Switching to {currency} — the rate table supplies the new FX when you save.
            </p>
          )}

          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border-b border-white/[0.06]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Earnings and deductions</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">{currency}</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {lines.map((line) => (
                <div key={line.label} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className={`text-xs ${line.strong ? 'font-bold text-theme-heading' : 'text-theme-muted'}`}>
                    {line.label}
                  </span>
                  {line.input ? (
                    <input
                      type="number"
                      step={line.step}
                      disabled={locked}
                      value={form[line.input]}
                      onChange={set(line.input)}
                      className="input-field !py-1 !px-2 w-32 text-right text-sm tabular-nums disabled:opacity-60"
                    />
                  ) : (
                    <span className={`text-sm tabular-nums ${
                      line.label === 'Final Net Pay Due'
                        ? `font-bold ${totals.net < 0 ? 'text-danger' : 'text-emerald-accent'}`
                        : line.strong ? 'font-bold text-theme-heading' : 'text-theme-heading'
                    }`}>
                      {line.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {totals.baseEquivalent !== null && (
              <div className="px-3 py-2 border-t border-white/[0.06] flex items-center justify-between">
                <span className="text-[11px] text-theme-muted">{periodCurrency} equivalent</span>
                <span className="text-[11px] text-gold-accent tabular-nums">{money(totals.baseEquivalent)}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-[11px] text-theme-muted">
            <span>Suggested hours from evidence: {Number(row.suggested_hours ?? 0).toFixed(2)}</span>
            {row.evidence_incomplete && <span className="text-amber-400">Evidence incomplete</span>}
          </div>

          {(s?.exception_flags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {s!.exception_flags!.map((f) => (
                <span key={f} className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border bg-amber-500/15 text-amber-400 border-amber-500/30">
                  {f.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 pt-4 border-t border-white/[0.06] shrink-0">
          {s && onDownloadPayslip && (
            <button type="button" onClick={() => onDownloadPayslip(s.id)}
              className="btn-secondary text-sm py-2 px-4 flex items-center gap-2 mr-auto">
              <FileText size={14} /> Payslip PDF
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">
            {locked ? 'Close' : 'Cancel'}
          </button>
          {!locked && (
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" /> : <CheckCircle size={14} />} Save payslip
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
