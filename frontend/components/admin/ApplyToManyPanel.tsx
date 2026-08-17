'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Users } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { currencyCodes, useCurrencies } from '@/lib/currencies';
import type { PayRow } from '@/components/admin/WorkerPayModal';

export type Audience = 'all' | 'gs' | 'partners' | 'selected';

interface Props {
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
  { key: 'hours_logged', label: 'Hours' },
  { key: 'rate_per_hour', label: 'Rate / hr' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'transfer_cost', label: 'Transfer cost' },
  { key: 'external_cost', label: 'External cost' },
  { key: 'fx_rate', label: 'FX rate' },
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
  periodId,
  periodLabel,
  periodCurrency,
  rows,
  selectedIds,
  onApplied,
  onError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<Audience>('all');
  const [values, setValues] = useState<Record<FieldKey, string>>({
    hours_logged: '', rate_per_hour: '', bonus: '', transfer_cost: '', external_cost: '', fx_rate: '',
  });
  const [currency, setCurrency] = useState('');
  const [applying, setApplying] = useState(false);
  const currencies = useCurrencies();

  const targets = useMemo(
    () => audienceMembers(rows, audience, selectedIds),
    [rows, audience, selectedIds],
  );

  const filled = useMemo(
    () => FIELDS.filter((f) => values[f.key] !== '').map((f) => f.label),
    [values],
  );
  const hasValues = filled.length > 0 || currency !== '';

  async function apply() {
    if (!hasValues || targets.length === 0) return;
    const changes = [...filled, ...(currency ? [`Currency ${currency}`] : [])].join(', ');
    const who = audience === 'selected'
      ? `${targets.length} selected worker${targets.length === 1 ? '' : 's'}`
      : `${targets.length} ${AUDIENCES.find((a) => a.key === audience)!.label.toLowerCase()}`;
    if (!window.confirm(`Apply ${changes} to ${who} in ${periodLabel}?`)) return;

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
      setValues({ hours_logged: '', rate_per_hour: '', bonus: '', transfer_cost: '', external_cost: '', fx_rate: '' });
      setCurrency('');
      onApplied(targets.length);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to apply values.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="glass-panel overflow-hidden mb-5">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={15} className="text-theme-muted" /> : <ChevronRight size={15} className="text-theme-muted" />}
          <h2 className="text-sm font-bold text-theme-heading">Apply to many</h2>
          <span className="text-xs text-theme-muted">
            — type a value once, push it to everyone, one group, or just the rows you ticked
          </span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-white/[0.06] pt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">{f.label}</span>
                <input
                  type="number"
                  step="0.01"
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder="—"
                  disabled={f.key === 'fx_rate' && currency !== ''}
                  className="input-field !py-1.5 w-28 text-sm disabled:opacity-50"
                />
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

          <p className="text-[11px] text-theme-muted">
            Blank fields are left untouched. Amounts are in each worker&apos;s pay currency; FX is
            &ldquo;1 {periodCurrency} = x local&rdquo; and is resolved from the rate table when you switch currency.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1">
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
            <div className="flex-1" />
            <button type="button" onClick={apply} disabled={applying || !hasValues || targets.length === 0}
              className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              {applying ? <SpinningDots size="sm" /> : <Users size={14} />}
              Apply to {targets.length} worker{targets.length === 1 ? '' : 's'}
            </button>
          </div>

          {!hasValues && (
            <p className="text-[11px] text-theme-muted flex items-center gap-1.5">
              <AlertCircle size={12} /> Fill at least one field to enable Apply.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
