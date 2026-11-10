'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RecordedCurrencyNote from '@/components/currency/RecordedCurrencyNote';
import { AlertCircle, Check, Eye, Pencil, X } from 'lucide-react';
import { ScrollArrows } from '@/components/payroll/LedgerChrome';
import SpinningDots from '@/components/shared/SpinningDots';
import EditableCell from '@/components/payroll/EditableCell';
import WorkerPayModal, { type PayRow } from '@/components/admin/WorkerPayModal';
import NoTierModal, { hasPayTier, NO_TIER_ERROR_PREFIX } from '@/components/payroll/NoTierModal';
import { api } from '@/lib/api';

const USE_TIER = '__tier__';
const CATALOG_FX = '__catalog__';

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

export interface LedgerRow {
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
  periodCurrency: string;
  /** Shown in the eye pop-up's title. */
  periodLabel?: string;
  locked: boolean;
  /** Bump to reload rows after something else changed the payslips. */
  reloadKey?: number;
  onSaved: () => void;
  entryControls?: boolean;
  onRowsLoaded?: (rows: LedgerRow[]) => void;
  onSelectionChange?: (ids: Set<string>) => void;
}

const n = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const money = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hourlyOf = (t: PaymentTier) => String(t.hourly_equivalent ?? t.rate);
const followsTier = (r: LedgerRow) => hasPayTier(r.worker_pay_tier) && (!r.summary || !r.summary.admin_locked);

/** A cell that shows a value and, on hover, a pencil that opens a dropdown to change it. */
function SelectCell({ display, value, locked, label, onSave, children }: {
  display: React.ReactNode; value: string; locked: boolean; label: string;
  onSave: (value: string) => Promise<void>; children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (locked) return <span>{display}</span>;
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <select autoFocus disabled={busy} defaultValue={value} aria-label={label}
          onChange={async (e) => {
            setBusy(true);
            setError(null);
            try {
              await onSave(e.target.value);
              setEditing(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not save.');
            } finally {
              setBusy(false);
            }
          }}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          className="rounded-md border border-emerald-accent/40 bg-brand-surface-high px-2 py-1 text-sm text-white max-w-[13rem]">
          {children}
        </select>
        <button type="button" onClick={() => setEditing(false)} className="rounded-md p-1 text-theme-muted hover:text-theme-heading" aria-label="Cancel">
          <X size={14} />
        </button>
        {error && <span className="text-[10px] text-danger whitespace-nowrap">{error}</span>}
      </div>
    );
  }
  return (
    <div className="group flex items-center gap-1.5">
      <span className="min-w-0 cursor-text" onClick={() => setEditing(true)}>{display}</span>
      <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${label}`} title={`Edit ${label}`}
        className="shrink-0 rounded-md p-1 text-theme-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-emerald-accent hover:bg-emerald-accent/10">
        <Pencil size={12} />
      </button>
    </div>
  );
}

/** Every worker's payslip fields for one month: hover a value for its pencil; edits save straight away. */
export default function PeriodLedgerSheet({
  periodId, periodCurrency, periodLabel = '', locked, reloadKey = 0, entryControls = false, onSaved, onRowsLoaded, onSelectionChange,
}: Props) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [tiers, setTiers] = useState<PaymentTier[]>([]);
  const [fxRates, setFxRates] = useState<FxRate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [workerToEdit, setWorkerToEdit] = useState('');
  const [detail, setDetail] = useState<LedgerRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noTier, setNoTier] = useState<string[] | null>(null);
  const tableScroll = useRef<HTMLDivElement>(null);

  const load = useCallback((quiet = false) => {
    setError(null);
    if (!quiet) setLoading(true);
    Promise.all([
      api.get<LedgerRow[]>(`/payroll/periods/${periodId}/ledger`),
      api.get<PaymentTier[]>('/payment-tiers?active_only=true&scope=workers').catch(() => [] as PaymentTier[]),
      api.get<FxRate[]>(`/currencies/rates?base=${periodCurrency}`).catch(() => [] as FxRate[]),
    ])
      .then(([data, t, fx]) => {
        setRows(data);
        setTiers(t);
        setFxRates(fx);
        onRowsLoaded?.(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load workers'))
      .finally(() => setLoading(false));
    // onRowsLoaded is a parent callback; reloading on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId, periodCurrency]);

  useEffect(() => { load(); }, [load, reloadKey]);
  useEffect(() => { setSelected(new Set()); }, [periodId]);
  useEffect(() => {
    onSelectionChange?.(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const fxOptions = useMemo(() => {
    const byQuote = new Map<string, FxRate>();
    for (const r of fxRates) {
      if (r.base_currency !== periodCurrency) continue;
      const prev = byQuote.get(r.quote_currency);
      if (!prev || r.as_of_date > prev.as_of_date) byQuote.set(r.quote_currency, r);
    }
    return [...byQuote.values()].sort((a, b) => a.quote_currency.localeCompare(b.quote_currency));
  }, [fxRates, periodCurrency]);

  const afterSave = (message?: string) => {
    if (message) setNotice(message);
    onSaved();
    load(true);
  };

  const showSaveError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : 'Save failed';
    if (msg.startsWith(NO_TIER_ERROR_PREFIX)) {
      const names = msg.slice(NO_TIER_ERROR_PREFIX.length).replace(/^:\s*/, '').replace(/\.\s*Assign a payment tier[\s\S]*$/, '');
      setNoTier(names.split(',').map((x) => x.trim()).filter(Boolean));
      return;
    }
    throw e;
  };

  /**
   * Save one field of one worker. Rows with a payslip are patched (keeping
   * whether the rate follows the tier); rows without one get a payslip created.
   */
  const saveField = async (r: LedgerRow, fields: Record<string, unknown>) => {
    setError(null);
    setNotice(null);
    try {
      if (r.summary) {
        await api.patch(`/payroll/summaries/${r.summary.id}`, { admin_locked: Boolean(r.summary.admin_locked), ...fields });
      } else {
        await api.post(`/payroll/periods/${periodId}/summaries/bulk`, {
          upsert: true,
          rows: [{ worker_id: r.worker_id, ...fields, ...(hasPayTier(r.worker_pay_tier) ? { use_tier: true } : {}) }],
        });
      }
      afterSave();
    } catch (e) {
      showSaveError(e);
    }
  };

  const saveRate = async (r: LedgerRow, value: string) => {
    if (value === USE_TIER) {
      if (!hasPayTier(r.worker_pay_tier)) {
        setNoTier([r.worker_display_name]);
        return;
      }
      setError(null);
      try {
        await api.post(`/payroll/periods/${periodId}/summaries/bulk`, {
          upsert: true, rows: [{ worker_id: r.worker_id, use_tier: true }],
        });
        afterSave();
      } catch (e) {
        showSaveError(e);
      }
      return;
    }
    if (r.summary) {
      setError(null);
      await api.patch(`/payroll/summaries/${r.summary.id}`, { rate_per_hour: Number(value || 0), admin_locked: true });
      afterSave();
    } else {
      await saveField(r, { rate_per_hour: Number(value || 0), admin_locked: true });
    }
  };

  const rateOptions = (r: LedgerRow) => {
    const ownTier = tiers.find((t) => t.name === r.worker_pay_tier);
    const current = r.summary ? String(n(r.summary.rate_per_hour)) : '';
    const known = new Set(tiers.map(hourlyOf));
    return (
      <>
        <option value={USE_TIER}>{ownTier ? `Use tier · ${n(hourlyOf(ownTier)).toFixed(2)} ${ownTier.currency}` : 'Use tier'}</option>
        {tiers.map((t) => <option key={t.id} value={hourlyOf(t)}>{t.name} · {n(hourlyOf(t)).toFixed(2)}</option>)}
        {current && !known.has(current) && <option value={current}>Custom {n(current).toFixed(2)}</option>}
      </>
    );
  };

  const allRowsSelected = rows.length > 0 && rows.every((r) => selected.has(r.worker_id));
  const th = 'px-2 py-2.5 text-theme-muted font-semibold whitespace-nowrap';
  const td = 'px-2 py-1.5 align-middle';

  return (
    <div className="client-ledger-plain">
      <RecordedCurrencyNote />
      {entryControls && <div className="flex flex-wrap items-center gap-2 mb-3">
        <select aria-label="Worker for payslip data" value={workerToEdit} onChange={event => setWorkerToEdit(event.target.value)} className="input-field min-w-[200px]">
          <option value="">Select a worker…</option>
          {rows.map(row => <option key={row.worker_id} value={row.worker_id}>{row.worker_display_name}</option>)}
        </select>
        <button type="button" disabled={!workerToEdit || loading} onClick={() => setDetail(rows.find(row => row.worker_id === workerToEdit) ?? null)} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {locked ? 'View payslip data' : 'Add / edit payslip data'}
        </button>
      </div>}

      <div className="glass-panel flex min-w-0 w-full flex-col h-[calc(100vh-24rem)] min-h-[28rem] overflow-hidden">
        {error && (
          <div className="mx-4 sm:mx-5 mt-2 shrink-0 flex items-center gap-2 p-2 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
            <AlertCircle size={12} /> {error}
          </div>
        )}
        {notice && (
          <div className="mx-4 sm:mx-5 mt-2 shrink-0 flex items-center gap-2 p-2 rounded-lg bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-xs">
            <Check size={12} /> {notice}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-b border-theme px-4 py-2 text-xs font-semibold text-theme-muted">
          <span>Scroll table</span>
          <ScrollArrows target={tableScroll} label="table" />
        </div>
        <div ref={tableScroll} tabIndex={0} aria-label="Payroll ledger table, scroll horizontally for more columns" className="w-full min-w-0 flex-1 min-h-0 overflow-auto overscroll-contain">
          {loading ? (
            <div className="flex justify-center py-20"><SpinningDots size="lg" className="text-emerald-accent" /></div>
          ) : error && rows.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-theme-muted text-sm">Worker data could not be loaded.</p>
              <button type="button" onClick={() => load()} className="btn-primary mt-3 px-4 py-2 text-sm">Retry loading</button>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-theme-muted text-sm py-16">No workers are available for this month.</p>
          ) : (
            <table className="w-full min-w-[1400px] text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-brand-surface-lowest shadow-[0_1px_0_rgba(255,255,255,0.06)]">
                <tr className="border-b border-white/[0.08]">
                  <th className="sticky left-0 z-30 w-10 min-w-10 px-2 py-2.5 text-left bg-brand-surface-lowest">
                    {!locked && onSelectionChange && (
                      <input type="checkbox" aria-label="Select all workers" checked={allRowsSelected}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelected((prev) => {
                            const next = new Set(prev);
                            rows.forEach((r) => { if (checked) next.add(r.worker_id); else next.delete(r.worker_id); });
                            return next;
                          });
                        }} />
                    )}
                  </th>
                  <th className={`${th} sticky left-10 z-30 min-w-[11rem] text-left bg-brand-surface-lowest`}>Worker</th>
                  <th className={`${th} text-left`}>Tier</th>
                  <th className={`${th} text-right`} title="Approved session hours. Use the pencil to set hours by hand.">Hours</th>
                  <th className={`${th} text-right`}>Sessions</th>
                  <th className={`${th} text-left`}>Rate</th>
                  <th className={`${th} text-right`}>Bonus</th>
                  <th className={`${th} text-right`}>Transfer cost</th>
                  <th className={`${th} text-right`}>External cost</th>
                  <th className={`${th} text-left`} title="1 reporting-currency unit = this many units of the worker's currency">FX</th>
                  <th className={`${th} text-right`}>Gross</th>
                  <th className={`${th} text-right`}>Net</th>
                  <th className={`${th} w-10`} aria-label="View and edit" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = r.summary;
                  const cur = s?.local_currency ?? '';
                  const hours = s ? n(s.hours_logged) : n(r.suggested_hours);
                  const manualHours = s && hours.toFixed(2) !== n(r.suggested_hours).toFixed(2);
                  const ownTier = tiers.find((t) => t.name === r.worker_pay_tier);
                  const tierRate = followsTier(r);
                  const receivingRate = s ? s.rate_per_hour : ownTier ? hourlyOf(ownTier) : null;
                  const receivingCurrency = s?.local_currency || ownTier?.currency || periodCurrency;
                  const amountCell = (key: 'bonus' | 'transfer_cost' | 'external_cost', label: string) => (
                    <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                      <EditableCell label={label} locked={locked} inputWidth="w-24"
                        value={String(n(s?.[key]))}
                        onSave={(v) => saveField(r, { [key]: Number(v || 0) })}
                        display={money(n(s?.[key]))} />
                    </td>
                  );
                  return (
                    <tr key={r.worker_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className={`${td} sticky left-0 z-20 w-10 min-w-10 bg-brand-surface-lowest`}>
                        {onSelectionChange && <input type="checkbox" checked={selected.has(r.worker_id)} disabled={locked}
                          onChange={(ev) => setSelected((prev) => {
                            const next = new Set(prev);
                            if (ev.target.checked) next.add(r.worker_id); else next.delete(r.worker_id);
                            return next;
                          })} />}
                      </td>
                      <td className={`${td} sticky left-10 z-20 min-w-[11rem] bg-brand-surface-lowest`}>
                        <p className="text-theme-heading font-medium truncate max-w-[14rem]" title={r.worker_display_name}>{r.worker_display_name}</p>
                        <p className="text-[10px] text-theme-muted truncate">
                          {r.worker_country} · {r.worker_type === 'partner_worker' ? 'Partner' : 'GS'}
                          {!s && ' · no payslip yet'}
                        </p>
                      </td>
                      <td className={`${td} text-theme-muted whitespace-nowrap`}>
                        <p>{hasPayTier(r.worker_pay_tier) ? r.worker_pay_tier : 'Unassigned'}</p>
                        {receivingRate != null && (
                          <p className="text-xs tabular-nums">{money(n(receivingRate))} {receivingCurrency}/h</p>
                        )}
                      </td>
                      <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                        <EditableCell label="hours" locked={locked} inputWidth="w-20"
                          hint={`Edit hours (sessions show ${n(r.suggested_hours).toFixed(2)} h; leave blank to follow them)`}
                          value={hours.toFixed(2)}
                          onSave={(v) => saveField(r, { hours_logged: v === '' ? null : Number(v) })}
                          display={
                            <span className={manualHours ? 'text-amber-400' : 'text-theme-heading'}
                              title={manualHours ? `Set by hand — sessions show ${n(r.suggested_hours).toFixed(2)} h` : 'From approved sessions'}>
                              {hours.toFixed(2)}
                            </span>
                          } />
                      </td>
                      <td className={`${td} text-right tabular-nums text-theme-muted`}>{r.session_count ?? 0}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        <SelectCell label="rate" locked={locked}
                          value={tierRate ? USE_TIER : String(n(s?.rate_per_hour))}
                          onSave={(v) => saveRate(r, v)}
                          display={
                            tierRate
                              ? <span>{ownTier ? `${n(hourlyOf(ownTier)).toFixed(2)} ${ownTier.currency}` : 'Tier'}<span className="ml-1 text-[10px] text-theme-muted">· tier</span></span>
                              : s && n(s.rate_per_hour) > 0
                                ? <span className="tabular-nums">{money(n(s.rate_per_hour))}<span className="ml-1 text-[10px] text-theme-muted">/h · fixed</span></span>
                                : <span className="text-theme-muted">Not set</span>
                          }>
                          {rateOptions(r)}
                        </SelectCell>
                      </td>
                      {amountCell('bonus', 'bonus')}
                      {amountCell('transfer_cost', 'transfer cost')}
                      {amountCell('external_cost', 'external cost')}
                      <td className={`${td} whitespace-nowrap`}>
                        {s ? (
                          <SelectCell label="FX" locked={locked}
                            value={s.fx_rate != null ? String(Number(s.fx_rate)) : CATALOG_FX}
                            onSave={(v) => saveField(r, { fx_rate: v === CATALOG_FX ? null : Number(v) })}
                            display={s.fx_rate != null
                              ? <span className="tabular-nums">{cur} {Number(s.fx_rate)}</span>
                              : <span className="text-theme-muted">Catalog FX</span>}>
                            <option value={CATALOG_FX}>Catalog FX</option>
                            {fxOptions.map((x) => <option key={x.id} value={String(Number(x.rate))}>{x.quote_currency} {Number(x.rate)}</option>)}
                            {s.fx_rate != null && !fxOptions.some((x) => Number(x.rate) === Number(s.fx_rate)) && (
                              <option value={String(Number(s.fx_rate))}>Custom {Number(s.fx_rate)}</option>
                            )}
                          </SelectCell>
                        ) : <span className="text-theme-muted">—</span>}
                      </td>
                      <td className={`${td} text-right tabular-nums text-theme-muted whitespace-nowrap`}>
                        {s ? <>{money(n(s.gross_earned))}<span className="ml-1 text-[10px]">{cur}</span></> : '—'}
                      </td>
                      <td className={`${td} text-right tabular-nums font-semibold whitespace-nowrap ${s && n(s.final_net) < 0 ? 'text-danger' : 'text-emerald-accent'}`}>
                        {s ? <>{money(n(s.final_net))}<span className="ml-1 text-[10px] font-normal text-theme-muted">{cur}</span></> : '—'}
                      </td>
                      <td className={`${td} text-right`}>
                        <button type="button" onClick={() => setDetail(r)}
                          title={locked ? 'View payslip detail' : 'View and edit payslip detail'}
                          aria-label={`View ${r.worker_display_name}`}
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
          )}
        </div>
      </div>

      {detail && (
        <WorkerPayModal
          row={detail as unknown as PayRow}
          periodId={periodId}
          periodLabel={periodLabel}
          periodCurrency={periodCurrency}
          defaultCurrency={detail.summary?.local_currency ?? ownTierCurrency(tiers, detail) ?? periodCurrency}
          locked={locked}
          onClose={() => setDetail(null)}
          onSaved={() => afterSave()}
        />
      )}
      {noTier && <NoTierModal names={noTier} onClose={() => setNoTier(null)} />}
    </div>
  );
}

function ownTierCurrency(tiers: PaymentTier[], r: LedgerRow): string | undefined {
  return tiers.find((t) => t.name === r.worker_pay_tier)?.currency;
}
