'use client';

import Link from 'next/link';
import RecordedCurrencyNote from '@/components/currency/RecordedCurrencyNote';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowLeft, Check, Lock, Save } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import PeriodFilter from '@/components/platform/PeriodFilter';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import type { ClientLedgerSheet, ClientMonth } from '@/lib/client-billing';
import { pickCurrentPeriod } from '@/lib/periods';

interface Period {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
  currency: string;
  is_current?: boolean;
}

interface Edit {
  hours_from_desktops: boolean;
  billed_hours_manual: string;
  rate: string;
  actual: string;
  received_on: string;
  client_pct: string;
  one_off: string;
  selected: boolean;
}

const n = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const money = (v: number | null) => (v == null ? '—' : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const blankOr = (v: string | null) => (v == null ? '' : String(Number(v)));

function toEdit(r: ClientMonth): Edit {
  return {
    hours_from_desktops: r.hours_from_desktops,
    billed_hours_manual: blankOr(r.billed_hours_manual),
    rate: r.rate_source === 'client' ? blankOr(r.rate) : '',
    actual: blankOr(r.actual),
    received_on: r.received_on ?? '',
    client_pct: String(Number(r.client_pct)),
    one_off: String(Number(r.one_off_costs)),
    selected: false,
  };
}

/** What the row will show once saved, worked out the same way as the server. */
function preview(r: ClientMonth, e: Edit) {
  const billed = e.hours_from_desktops ? n(r.desktop_hours) : e.billed_hours_manual === '' ? null : n(e.billed_hours_manual);
  const rate = r.rate_source === 'tier' ? n(r.rate) : e.rate === '' ? null : n(e.rate);
  const expected = billed != null && rate != null ? billed * rate : null;
  const actual = e.actual === '' ? null : n(e.actual);
  const basis = actual ?? expected ?? 0;
  const costs = n(r.shared_costs) + n(e.one_off);
  const clientShare = basis * n(e.client_pct) / 100 - costs;
  return {
    billed, rate, expected, actual, basis, costs,
    variance: actual != null && expected != null ? actual - expected : null,
    clientShare,
    gsShare: basis - clientShare,
    gsMargin: basis - clientShare - n(r.worker_cost) - costs,
  };
}

function changes(r: ClientMonth, e: Edit): Record<string, unknown> {
  const o = toEdit(r);
  const out: Record<string, unknown> = {};
  if (e.hours_from_desktops !== o.hours_from_desktops) out.hours_from_desktops = e.hours_from_desktops;
  if (e.billed_hours_manual !== o.billed_hours_manual) out.billed_hours_manual = e.billed_hours_manual === '' ? null : n(e.billed_hours_manual);
  if (r.rate_source !== 'tier' && e.rate !== o.rate) out.rate = e.rate === '' ? null : n(e.rate);
  if (e.actual !== o.actual) out.actual = e.actual === '' ? null : n(e.actual);
  if (e.received_on !== o.received_on) out.received_on = e.received_on || null;
  if (n(e.client_pct) !== n(o.client_pct)) out.client_pct = n(e.client_pct);
  if (n(e.one_off) !== n(o.one_off)) out.client_costs = n(e.one_off);
  return out;
}

export default function ClientLedgerPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [sheet, setSheet] = useState<ClientLedgerSheet | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showMargin, setShowMargin] = useState(false);
  const [bulk, setBulk] = useState({ client_pct: '', one_off: '', desktops: '', rate: '' });

  useEffect(() => {
    api.get<Period[]>('/payroll/periods')
      .then((list) => {
        setPeriods(list);
        const wanted = new URLSearchParams(window.location.search).get('period');
        const pick = list.find((p) => p.id === wanted) ?? pickCurrentPeriod(list) ?? list[0];
        if (pick) setPeriodId(pick.id);
        else setLoading(false);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Failed to load work months'); setLoading(false); });
  }, []);

  const adopt = useCallback((data: ClientLedgerSheet) => {
    setSheet(data);
    const map: Record<string, Edit> = {};
    data.rows.forEach((r) => { map[r.client_id] = toEdit(r); });
    setEdits(map);
  }, []);

  const load = useCallback(() => {
    if (!periodId) return;
    setLoading(true);
    setError(null);
    api.get<ClientLedgerSheet>(`/client-billing/periods/${periodId}`)
      .then(adopt)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the client ledger'))
      .finally(() => setLoading(false));
  }, [periodId, adopt]);

  useEffect(() => { load(); }, [load]);

  const periodPaid = sheet?.status === 'paid';
  const rows = sheet?.rows ?? [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && r.contract_status !== 'active' && !n(r.basis) && !n(r.client_costs)) return false;
      if (!q) return true;
      return r.client_name.toLowerCase().includes(q) || r.platform.toLowerCase().includes(q) || (r.tier_name || '').toLowerCase().includes(q);
    });
  }, [rows, search, showInactive]);

  const setField = <K extends keyof Edit>(id: string, key: K, value: Edit[K]) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  const applyBulk = (scope: 'selected' | 'visible') => {
    const targets = visible.filter((r) => !r.locked && (scope === 'visible' || edits[r.client_id]?.selected));
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of targets) {
        const e = { ...next[r.client_id] };
        if (bulk.client_pct !== '') e.client_pct = bulk.client_pct;
        if (bulk.one_off !== '') e.one_off = bulk.one_off;
        if (bulk.desktops === 'on') e.hours_from_desktops = true;
        if (bulk.desktops === 'off') e.hours_from_desktops = false;
        if (bulk.rate !== '' && r.rate_source !== 'tier') e.rate = bulk.rate;
        next[r.client_id] = e;
      }
      return next;
    });
  };

  const dirty = rows.filter((r) => edits[r.client_id] && Object.keys(changes(r, edits[r.client_id])).length > 0);

  const save = async () => {
    if (!dirty.length) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const data = await api.put<ClientLedgerSheet>(`/client-billing/periods/${periodId}/rows`, {
        rows: dirty.map((r) => ({ client_id: r.client_id, ...changes(r, edits[r.client_id]) })),
      });
      adopt(data);
      setNotice(`Saved ${dirty.length} client${dirty.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const totals = useMemo(() => {
    const t = { expected: 0, actual: 0, basis: 0, costs: 0, client: 0, gs: 0, worker: 0, margin: 0 };
    for (const r of visible) {
      const e = edits[r.client_id];
      if (!e) continue;
      const p = preview(r, e);
      t.expected += p.expected ?? 0;
      t.actual += p.actual ?? 0;
      t.basis += p.basis;
      t.costs += p.costs;
      t.client += p.clientShare;
      t.gs += p.gsShare;
      t.worker += n(r.worker_cost);
      t.margin += p.gsMargin;
    }
    return t;
  }, [visible, edits]);

  const th = 'px-2 py-2.5 text-theme-muted font-semibold whitespace-nowrap';
  const cellInput = 'input-field !py-1 !px-1 w-full min-w-0 text-right text-xs';

  return (
    <div>
      <PageHeader
        title="Client Ledger"
        compact
        actions={
          <>
            <PeriodFilter periods={periods} value={periodId} onChange={setPeriodId} variant="inline" label="Working month" />
            <Link href="/admin/payroll/client-payouts" className="btn-secondary text-xs py-2 px-3">Client payouts</Link>
            <Link href="/admin/payroll/month" className="btn-secondary text-xs py-2 px-3">Month overview</Link>
            <Link href="/admin/clients" className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
              <ArrowLeft size={14} /> Clients
            </Link>
          </>
        }
      />

      <RecordedCurrencyNote recorded="USD" />

      {periodPaid && (
        <p className="text-xs text-amber-400 mb-3">{sheet?.period_label} is paid, so its client figures are locked.</p>
      )}

      <div className="glass-panel flex flex-col h-[calc(100vh-17rem)] min-h-[28rem] overflow-hidden">
        <div className="px-4 sm:px-5 py-2.5 border-b border-white/[0.06] shrink-0 bg-white/[0.02]">
          {!periodPaid && (
            <div className="flex flex-wrap gap-x-3 gap-y-2 items-end mb-2">
              <label className="block">
                <span className="text-[9px] uppercase text-theme-muted">Client %</span>
                <input type="number" min={0} max={100} step="0.01" value={bulk.client_pct}
                  onChange={(e) => setBulk((b) => ({ ...b, client_pct: e.target.value }))}
                  className="input-field !py-1.5 w-[4.5rem] text-xs mt-0.5" />
              </label>
              <label className="block">
                <span className="text-[9px] uppercase text-theme-muted">Costs</span>
                <input type="number" min={0} step="0.01" value={bulk.one_off}
                  onChange={(e) => setBulk((b) => ({ ...b, one_off: e.target.value }))}
                  className="input-field !py-1.5 w-[4.5rem] text-xs mt-0.5" />
              </label>
              <label className="block">
                <span className="text-[9px] uppercase text-theme-muted">Rate USD/h</span>
                <input type="number" min={0} step="0.01" value={bulk.rate}
                  onChange={(e) => setBulk((b) => ({ ...b, rate: e.target.value }))}
                  className="input-field !py-1.5 w-[5rem] text-xs mt-0.5" />
              </label>
              <label className="block">
                <span className="text-[9px] uppercase text-theme-muted">Desktop hours</span>
                <select value={bulk.desktops} onChange={(e) => setBulk((b) => ({ ...b, desktops: e.target.value }))}
                  className="input-field !py-1.5 w-[6rem] text-xs mt-0.5">
                  <option value="">Leave</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <button type="button" onClick={() => applyBulk('selected')} className="btn-secondary text-xs py-1.5 px-2.5">Selected</button>
              <button type="button" onClick={() => applyBulk('visible')} className="btn-secondary text-xs py-1.5 px-2.5">Visible</button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients…" className="input-field !py-1.5 text-sm w-full max-w-xs" />
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-theme-muted">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Inactive clients
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showMargin} onChange={(e) => setShowMargin(e.target.checked)} /> Worker cost &amp; margin
              </label>
              <span>{visible.length} clients · USD</span>
            </div>
          </div>
        </div>

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

        <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
          {loading ? (
            <div className="flex justify-center py-20"><SpinningDots size="lg" className="text-emerald-accent" /></div>
          ) : visible.length === 0 ? (
            <p className="text-center text-theme-muted text-sm py-16">No clients match.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-brand-surface-lowest shadow-[0_1px_0_rgba(255,255,255,0.06)]">
                <tr className="border-b border-white/[0.08]">
                  <th className="px-2 py-2.5 w-8 text-left">
                    {!periodPaid && (
                      <input type="checkbox" aria-label="Select all visible" onChange={(ev) => {
                        const checked = ev.target.checked;
                        setEdits((prev) => {
                          const next = { ...prev };
                          visible.forEach((r) => { if (!r.locked) next[r.client_id] = { ...next[r.client_id], selected: checked }; });
                          return next;
                        });
                      }} />
                    )}
                  </th>
                  <th className={`${th} text-left min-w-[9rem]`}>Client</th>
                  <th className={`${th} text-center`} title="On: billed hours are the Hours Log hours on this client's desktops. Off: type the hours.">Desktop hrs</th>
                  <th className={`${th} text-right w-[5rem]`}>Hours</th>
                  <th className={`${th} text-right w-[5.5rem]`} title="A client tier's hourly rate wins over the typed rate.">Rate</th>
                  <th className={`${th} text-right`}>Expected</th>
                  <th className={`${th} text-right w-[6rem]`}>Received</th>
                  <th className={`${th} text-left w-[8rem]`}>Received on</th>
                  <th className={`${th} text-right`}>Variance</th>
                  <th className={`${th} text-right w-[4.5rem]`}>Client %</th>
                  <th className={`${th} text-right w-[5rem]`} title="Shared costs from the cost ledger plus costs typed here.">Costs</th>
                  <th className={`${th} text-right`}>Client share</th>
                  <th className={`${th} text-right`}>GS share</th>
                  {showMargin && <th className={`${th} text-right`}>Worker cost</th>}
                  {showMargin && <th className={`${th} text-right`}>GS margin</th>}
                  <th className={`${th} text-left`}>Payout</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const e = edits[r.client_id];
                  if (!e) return null;
                  const p = preview(r, e);
                  const off = periodPaid || r.locked;
                  const isDirty = Object.keys(changes(r, e)).length > 0;
                  return (
                    <tr key={r.client_id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] ${isDirty ? 'bg-amber-400/[0.04]' : ''}`}>
                      <td className="px-2 py-1.5 align-middle">
                        <input type="checkbox" checked={e.selected} disabled={off} onChange={(ev) => setField(r.client_id, 'selected', ev.target.checked)} />
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <p className="text-theme-heading font-medium truncate max-w-[12rem] flex items-center gap-1" title={r.client_name}>
                          {r.locked && <Lock size={10} className="text-theme-muted shrink-0" />}
                          {r.client_name}
                          {r.warnings.length > 0 && (
                            <span title={r.warnings.join('\n')} aria-label="Warnings" className="shrink-0 inline-flex">
                              <AlertTriangle size={11} className="text-amber-400" />
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-theme-muted truncate">
                          {r.platform}{r.contract_status !== 'active' ? ` · ${r.contract_status}` : ''}
                          {r.desktop_count ? ` · ${r.desktop_count} desktop${r.desktop_count === 1 ? '' : 's'}` : ''}
                        </p>
                      </td>
                      <td className="px-2 py-1.5 align-middle text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={e.hours_from_desktops}
                          disabled={off}
                          onClick={() => setField(r.client_id, 'hours_from_desktops', !e.hours_from_desktops)}
                          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors disabled:opacity-50 ${e.hours_from_desktops ? 'bg-emerald-accent' : 'bg-white/15'}`}
                          title={e.hours_from_desktops ? `On · desktops show ${n(r.desktop_hours).toFixed(2)} h` : 'Off · type the hours'}
                        >
                          <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${e.hours_from_desktops ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                        </button>
                      </td>
                      <td className="px-1 py-1 align-middle">
                        {e.hours_from_desktops ? (
                          <p className="text-right tabular-nums text-theme-heading px-1" title="From the Hours Log">{n(r.desktop_hours).toFixed(2)}</p>
                        ) : (
                          <input type="number" min={0} step="0.25" disabled={off} value={e.billed_hours_manual}
                            onChange={(ev) => setField(r.client_id, 'billed_hours_manual', ev.target.value)}
                            placeholder={n(r.desktop_hours) ? n(r.desktop_hours).toFixed(2) : '—'}
                            className={cellInput} />
                        )}
                      </td>
                      <td className="px-1 py-1 align-middle">
                        {r.rate_source === 'tier' ? (
                          <p className="text-right tabular-nums px-1" title={`From tier ${r.tier_name}`}>
                            {n(r.rate).toFixed(2)}
                            <span className="block text-[9px] text-theme-muted truncate">{r.tier_name}</span>
                          </p>
                        ) : (
                          <input type="number" min={0} step="0.01" disabled={off} value={e.rate}
                            onChange={(ev) => setField(r.client_id, 'rate', ev.target.value)} className={cellInput} />
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-middle text-right tabular-nums text-theme-muted">{money(p.expected)}</td>
                      <td className="px-1 py-1 align-middle">
                        <input type="number" min={0} step="0.01" disabled={off} value={e.actual} placeholder="—"
                          onChange={(ev) => setField(r.client_id, 'actual', ev.target.value)} className={cellInput} />
                      </td>
                      <td className="px-1 py-1 align-middle">
                        <input type="date" disabled={off} value={e.received_on}
                          onChange={(ev) => setField(r.client_id, 'received_on', ev.target.value)}
                          className="input-field !py-1 !px-1 w-full min-w-0 text-xs" />
                      </td>
                      <td className={`px-2 py-1.5 align-middle text-right tabular-nums ${p.variance == null ? 'text-theme-muted' : p.variance < 0 ? 'text-danger' : 'text-emerald-accent'}`}>
                        {p.variance == null ? '—' : `${p.variance > 0 ? '+' : ''}${money(p.variance)}`}
                      </td>
                      <td className="px-1 py-1 align-middle">
                        <input type="number" min={0} max={100} step="0.01" disabled={off} value={e.client_pct}
                          onChange={(ev) => setField(r.client_id, 'client_pct', ev.target.value)} className={cellInput} />
                      </td>
                      <td className="px-1 py-1 align-middle">
                        <input type="number" min={0} step="0.01" disabled={off} value={e.one_off}
                          onChange={(ev) => setField(r.client_id, 'one_off', ev.target.value)}
                          title={n(r.shared_costs) ? `Plus ${n(r.shared_costs).toFixed(2)} shared costs` : undefined}
                          className={cellInput} />
                        {n(r.shared_costs) > 0 && <p className="text-[9px] text-theme-muted text-right">+{n(r.shared_costs).toFixed(2)} shared</p>}
                      </td>
                      <td className={`px-2 py-1.5 align-middle text-right tabular-nums font-semibold ${p.clientShare < 0 ? 'text-danger' : 'text-gold-accent'}`}>{money(p.clientShare)}</td>
                      <td className="px-2 py-1.5 align-middle text-right tabular-nums text-emerald-accent font-semibold">{money(p.gsShare)}</td>
                      {showMargin && <td className="px-2 py-1.5 align-middle text-right tabular-nums text-theme-muted">{money(n(r.worker_cost))}</td>}
                      {showMargin && (
                        <td className={`px-2 py-1.5 align-middle text-right tabular-nums ${p.gsMargin < 0 ? 'text-danger' : 'text-theme-heading'}`}>{money(p.gsMargin)}</td>
                      )}
                      <td className="px-2 py-1.5 align-middle text-theme-muted whitespace-nowrap">
                        {r.payout_currency}
                        {r.payout_status && <span className="block text-[9px] uppercase">{r.payout_status}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-brand-surface-lowest shadow-[0_-1px_0_rgba(255,255,255,0.06)]">
                <tr className="font-semibold text-theme-heading">
                  <td colSpan={5} className="px-2 py-2 text-left">Total</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(totals.expected)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(totals.actual)}</td>
                  <td colSpan={3} />
                  <td className="px-2 py-2 text-right tabular-nums">{money(totals.costs)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gold-accent">{money(totals.client)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-emerald-accent">{money(totals.gs)}</td>
                  {showMargin && <td className="px-2 py-2 text-right tabular-nums">{money(totals.worker)}</td>}
                  {showMargin && <td className="px-2 py-2 text-right tabular-nums">{money(totals.margin)}</td>}
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {!periodPaid && (
          <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-white/[0.06] shrink-0 bg-brand-surface-lowest/80">
            <p className="text-[11px] text-theme-muted">
              Split is from gross: received if entered, else hours × rate. Client share = that × client % − costs.
            </p>
            <button type="button" disabled={saving || loading || !dirty.length} onClick={() => void save()} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
              <Save size={14} /> {saving ? 'Saving…' : dirty.length ? `Save ${dirty.length} change${dirty.length === 1 ? '' : 's'}` : 'Save changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
