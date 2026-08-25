'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Save, Table2, X } from 'lucide-react';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

interface PayrollSummary {
  id: string;
  worker_id: string;
  hours_logged: string | number;
  rate_per_hour: string | number;
  bonus: string | number;
  transfer_cost: string | number;
  external_cost: string | number;
  final_net: string | number;
  gross_earned: string | number;
  local_currency: string;
  fx_rate: string | number | null;
  admin_locked?: boolean;
  suggested_hours?: string | number | null;
  evidence_incomplete?: boolean | null;
}

interface LedgerRow {
  worker_id: string;
  worker_display_name: string;
  worker_country: string;
  worker_type: string | null;
  worker_pay_tier: string | null;
  suggested_hours: string | number;
  evidence_incomplete: boolean;
  session_count?: number;
  summary: PayrollSummary | null;
}

interface EditRow {
  worker_id: string;
  rate_per_hour: string;
  bonus: string;
  transfer_cost: string;
  external_cost: string;
  fx_rate: string;
  selected: boolean;
}

interface PaymentTier {
  id: string;
  name: string;
  currency: string;
  rate: string | number;
  hourly_equivalent: string | number | null;
}

interface FxRate {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: string | number;
  as_of_date: string;
}

interface Props {
  periodId: string;
  periodLabel: string;
  periodCurrency: string;
  locked: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function toEdit(row: LedgerRow): EditRow {
  const s = row.summary;
  return {
    worker_id: row.worker_id,
    rate_per_hour: s?.rate_per_hour != null && Number(s.rate_per_hour) !== 0 ? String(s.rate_per_hour) : '',
    bonus: String(s?.bonus ?? '0'),
    transfer_cost: String(s?.transfer_cost ?? '0'),
    external_cost: String(s?.external_cost ?? '0'),
    fx_rate: s?.fx_rate != null ? String(s.fx_rate) : '',
    selected: false,
  };
}

function hourlyOf(t: PaymentTier): string {
  return String(t.hourly_equivalent ?? t.rate);
}

export default function PeriodLedgerModal({
  periodId, periodLabel, periodCurrency, locked, onClose, onSaved,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [edits, setEdits] = useState<Record<string, EditRow>>({});
  const [tiers, setTiers] = useState<PaymentTier[]>([]);
  const [fxRates, setFxRates] = useState<FxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [bulk, setBulk] = useState({
    transfer_cost: '',
    external_cost: '',
    rate_per_hour: '',
    fx_rate: '',
  });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<LedgerRow[]>(`/payroll/periods/${periodId}/ledger`),
      api.get<PaymentTier[]>('/payment-tiers?active_only=true').catch(() => [] as PaymentTier[]),
      api.get<FxRate[]>(`/currencies/rates?base=${periodCurrency}`).catch(() => [] as FxRate[]),
    ])
      .then(([data, t, fx]) => {
        setRows(data);
        setTiers(t);
        setFxRates(fx);
        const map: Record<string, EditRow> = {};
        data.forEach((r) => { map[r.worker_id] = toEdit(r); });
        setEdits(map);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load ledger'))
      .finally(() => setLoading(false));
  }, [periodId, periodCurrency]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const fxOptions = useMemo(() => {
    const byQuote = new Map<string, FxRate>();
    for (const r of fxRates) {
      if (r.base_currency !== periodCurrency) continue;
      const prev = byQuote.get(r.quote_currency);
      if (!prev || r.as_of_date > prev.as_of_date) byQuote.set(r.quote_currency, r);
    }
    return [...byQuote.values()].sort((a, b) => a.quote_currency.localeCompare(b.quote_currency));
  }, [fxRates, periodCurrency]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.worker_display_name.toLowerCase().includes(q) ||
      r.worker_country.toLowerCase().includes(q) ||
      (r.worker_pay_tier || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const setField = (workerId: string, key: keyof EditRow, value: string | boolean) => {
    setEdits((prev) => ({
      ...prev,
      [workerId]: { ...prev[workerId], [key]: value },
    }));
  };

  const applyBulk = (scope: 'selected' | 'visible') => {
    const targets = scope === 'selected'
      ? visible.filter((r) => edits[r.worker_id]?.selected)
      : visible;
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of targets) {
        const e = { ...next[r.worker_id] };
        if (bulk.transfer_cost !== '') e.transfer_cost = bulk.transfer_cost;
        if (bulk.external_cost !== '') e.external_cost = bulk.external_cost;
        if (bulk.rate_per_hour === '__tier__') e.rate_per_hour = '';
        else if (bulk.rate_per_hour !== '') e.rate_per_hour = bulk.rate_per_hour;
        if (bulk.fx_rate === '__catalog__') e.fx_rate = '';
        else if (bulk.fx_rate !== '') e.fx_rate = bulk.fx_rate;
        next[r.worker_id] = e;
      }
      return next;
    });
  };

  const save = async () => {
    if (locked) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        upsert: true,
        rows: Object.values(edits).map((e) => ({
          worker_id: e.worker_id,
          bonus: Number(e.bonus || 0),
          transfer_cost: Number(e.transfer_cost || 0),
          external_cost: Number(e.external_cost || 0),
          ...(e.rate_per_hour !== '' ? { rate_per_hour: Number(e.rate_per_hour) } : {}),
          ...(e.fx_rate !== '' ? { fx_rate: Number(e.fx_rate) } : {}),
          admin_locked: true,
        })),
      };
      await api.post(`/payroll/periods/${periodId}/summaries/bulk`, payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const rateSelect = (workerId: string, value: string, current: string) => {
    const known = new Set(tiers.map(hourlyOf));
    return (
      <select
        disabled={locked}
        value={value}
        onChange={(ev) => setField(workerId, 'rate_per_hour', ev.target.value)}
        className="input-field !py-1 !px-1.5 w-full min-w-[7.5rem] max-w-[9rem] text-xs"
      >
        <option value="">Use tier</option>
        {tiers.map((t) => (
          <option key={t.id} value={hourlyOf(t)}>
            {t.name} · {Number(hourlyOf(t)).toFixed(2)}
          </option>
        ))}
        {current && !known.has(current) && (
          <option value={current}>Custom {Number(current).toFixed(2)}</option>
        )}
      </select>
    );
  };

  const fxSelect = (
    workerId: string,
    value: string,
    onChange?: (v: string) => void,
    bulkMode = false,
  ) => {
    const known = new Set(fxOptions.map((r) => String(r.rate)));
    return (
      <select
        disabled={locked}
        value={value}
        onChange={(ev) => (onChange ? onChange(ev.target.value) : setField(workerId, 'fx_rate', ev.target.value))}
        className="input-field !py-1 !px-1.5 w-full min-w-[8rem] max-w-[10rem] text-xs"
      >
        <option value="">{bulkMode ? 'Leave' : 'Catalog FX'}</option>
        {bulkMode && <option value="__catalog__">Catalog FX</option>}
        {fxOptions.map((r) => (
          <option key={r.id} value={String(r.rate)}>
            {r.quote_currency} {Number(r.rate)}
          </option>
        ))}
        {!bulkMode && value && !known.has(value) && (
          <option value={value}>Custom {value}</option>
        )}
      </select>
    );
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col p-2 sm:p-3 md:p-4" role="dialog" aria-modal="true" aria-label={`Ledger — ${periodLabel}`}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-modal relative z-10 flex flex-col flex-1 min-h-0 w-full overflow-hidden rounded-xl sm:rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-white/[0.06] shrink-0 bg-brand-surface-lowest/80">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-accent/15 text-emerald-accent">
              <Table2 size={16} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-theme-heading truncate">Ledger — {periodLabel}</h2>
              <p className="text-[11px] text-theme-muted">
                {rows.length} workers · {periodCurrency}
                {locked ? ' · read-only' : ' · edit rates and save'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-white/[0.06] shrink-0 bg-white/[0.02]">
          {!locked && (
            <div className="flex flex-wrap gap-x-3 gap-y-2 items-end mb-2">
              <label className="block">
                <span className="text-[9px] uppercase text-theme-muted">Bulk rate</span>
                <select
                  value={bulk.rate_per_hour}
                  onChange={(e) => setBulk((b) => ({ ...b, rate_per_hour: e.target.value }))}
                  className="input-field !py-1.5 w-[8rem] text-xs mt-0.5"
                >
                  <option value="">Leave</option>
                  <option value="__tier__">Use tier</option>
                  {tiers.map((t) => (
                    <option key={t.id} value={hourlyOf(t)}>
                      {t.name} · {Number(hourlyOf(t)).toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[9px] uppercase text-theme-muted">Transfer</span>
                <input type="number" step="0.01" value={bulk.transfer_cost}
                  onChange={(e) => setBulk((b) => ({ ...b, transfer_cost: e.target.value }))}
                  className="input-field !py-1.5 w-[4.5rem] text-xs mt-0.5" />
              </label>
              <label className="block">
                <span className="text-[9px] uppercase text-theme-muted">External</span>
                <input type="number" step="0.01" value={bulk.external_cost}
                  onChange={(e) => setBulk((b) => ({ ...b, external_cost: e.target.value }))}
                  className="input-field !py-1.5 w-[4.5rem] text-xs mt-0.5" />
              </label>
              <label className="block">
                <span className="text-[9px] uppercase text-theme-muted">FX</span>
                <div className="mt-0.5">{fxSelect('_bulk', bulk.fx_rate, (v) => setBulk((b) => ({ ...b, fx_rate: v })), true)}</div>
              </label>
              <button type="button" onClick={() => applyBulk('selected')} className="btn-secondary text-xs py-1.5 px-2.5">Selected</button>
              <button type="button" onClick={() => applyBulk('visible')} className="btn-secondary text-xs py-1.5 px-2.5">Visible</button>
            </div>
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workers…"
            className="input-field !py-1.5 text-sm w-full max-w-xs"
          />
        </div>

        {error && (
          <div className="mx-4 sm:mx-5 mt-2 shrink-0 flex items-center gap-2 p-2 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        {/* Table — fills remaining height */}
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
          {loading ? (
            <div className="flex justify-center py-20"><SpinningDots size="lg" className="text-emerald-accent" /></div>
          ) : visible.length === 0 ? (
            <p className="text-center text-theme-muted text-sm py-16">No workers match your search.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-brand-surface-lowest shadow-[0_1px_0_rgba(255,255,255,0.06)]">
                <tr className="border-b border-white/[0.08]">
                  <th className="px-2 py-2.5 w-8 text-left">
                    {!locked && (
                      <input type="checkbox" aria-label="Select all visible" onChange={(e) => {
                        const checked = e.target.checked;
                        setEdits((prev) => {
                          const next = { ...prev };
                          visible.forEach((r) => { next[r.worker_id] = { ...next[r.worker_id], selected: checked }; });
                          return next;
                        });
                      }} />
                    )}
                  </th>
                  <th className="text-left px-2 py-2.5 text-theme-muted font-semibold min-w-[9rem]">Worker</th>
                  <th className="text-left px-2 py-2.5 text-theme-muted font-semibold w-20">Tier</th>
                  <th className="text-right px-2 py-2.5 text-theme-muted font-semibold w-16">Hrs</th>
                  <th className="text-right px-2 py-2.5 text-theme-muted font-semibold w-14">Sess</th>
                  <th className="text-left px-2 py-2.5 text-theme-muted font-semibold min-w-[8.5rem]">Rate</th>
                  <th className="text-right px-2 py-2.5 text-theme-muted font-semibold w-[4.5rem]">Bonus</th>
                  <th className="text-right px-2 py-2.5 text-theme-muted font-semibold w-[4.5rem]">Xfer</th>
                  <th className="text-right px-2 py-2.5 text-theme-muted font-semibold w-[4.5rem]">Ext</th>
                  <th className="text-left px-2 py-2.5 text-theme-muted font-semibold min-w-[8.5rem]">FX</th>
                  <th className="text-right px-2 py-2.5 text-theme-muted font-semibold w-20">Net</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const e = edits[r.worker_id];
                  if (!e) return null;
                  return (
                    <tr key={r.worker_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-2 py-1.5 align-middle">
                        <input type="checkbox" checked={e.selected} onChange={(ev) => setField(r.worker_id, 'selected', ev.target.checked)} disabled={locked} />
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <p className="text-theme-heading font-medium truncate max-w-[12rem]" title={r.worker_display_name}>{r.worker_display_name}</p>
                        <p className="text-[10px] text-theme-muted truncate">{r.worker_country} · {r.worker_type === 'partner_worker' ? 'Partner' : 'GS'}</p>
                      </td>
                      <td className="px-2 py-1.5 align-middle text-theme-muted truncate max-w-[5rem]" title={r.worker_pay_tier || undefined}>{r.worker_pay_tier || '—'}</td>
                      <td className="px-2 py-1.5 align-middle text-right tabular-nums">{Number(r.suggested_hours).toFixed(2)}</td>
                      <td className="px-2 py-1.5 align-middle text-right text-theme-muted">{r.session_count ?? 0}</td>
                      <td className="px-1 py-1 align-middle">{rateSelect(r.worker_id, e.rate_per_hour, e.rate_per_hour)}</td>
                      {(['bonus', 'transfer_cost', 'external_cost'] as const).map((key) => (
                        <td key={key} className="px-1 py-1 align-middle">
                          <input
                            type="number"
                            step="0.01"
                            disabled={locked}
                            value={e[key]}
                            onChange={(ev) => setField(r.worker_id, key, ev.target.value)}
                            className="input-field !py-1 !px-1 w-full min-w-0 text-right text-xs"
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1 align-middle">{fxSelect(r.worker_id, e.fx_rate)}</td>
                      <td className="px-2 py-1.5 align-middle text-right tabular-nums text-emerald-accent font-semibold whitespace-nowrap">
                        {r.summary ? Number(r.summary.final_net).toFixed(2) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 sm:px-5 py-3 border-t border-white/[0.06] shrink-0 bg-brand-surface-lowest/80">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Close</button>
          {!locked && (
            <button type="button" disabled={saving} onClick={save} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
              <Save size={14} /> {saving ? 'Saving…' : 'Save ledger'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
