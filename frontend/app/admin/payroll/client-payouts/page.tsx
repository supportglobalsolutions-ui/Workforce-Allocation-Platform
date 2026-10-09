'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, AlertTriangle, Banknote, Check, CheckCircle2, Clock, Download, Mail, RefreshCw, Undo2, Wallet, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import PeriodFilter from '@/components/platform/PeriodFilter';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { displayCurrencyFor, formatMoney, formatMoneyAmount, useMoneyDisplay } from '@/lib/money';
import { downloadFile } from '@/lib/download';
import type { ClientPayoutRow, ClientPayoutSheet, PayoutStatus } from '@/lib/client-billing';
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

const n = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const money = (v: string | number | null | undefined) =>
  v == null ? '—' : n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Amounts recorded in USD, shown in the top-bar display currency when one is chosen. */
const usd = (v: string | number | null | undefined) => (v == null ? '—' : formatMoneyAmount(n(v), 'USD'));
const usdWithCode = (v: string | number | null | undefined) => (v == null ? '—' : formatMoney(n(v), 'USD'));

const STATUS_STYLE: Record<PayoutStatus, string> = {
  not_prepared: 'text-theme-muted border-white/10',
  draft: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
  sent: 'text-sky-300 border-sky-400/30 bg-sky-400/10',
  paid: 'text-emerald-accent border-emerald-accent/30 bg-emerald-accent/10',
};
const STATUS_LABEL: Record<PayoutStatus, string> = {
  not_prepared: 'Preview',
  draft: 'To send',
  sent: 'Sent',
  paid: 'Paid',
};

export default function ClientPayoutsPage() {
  useMoneyDisplay();
  const cur = displayCurrencyFor('USD');
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [sheet, setSheet] = useState<ClientPayoutSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rateEdit, setRateEdit] = useState<{ id: string; value: string } | null>(null);
  const [payTarget, setPayTarget] = useState<ClientPayoutRow | null>(null);
  const [payForm, setPayForm] = useState({ reference: '', paid_on: '' });

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

  const load = useCallback(() => {
    if (!periodId) return;
    setLoading(true);
    setError(null);
    api.get<ClientPayoutSheet>(`/client-payouts/periods/${periodId}`)
      .then((data) => { setSheet(data); setSelected(new Set()); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load client payouts'))
      .finally(() => setLoading(false));
  }, [periodId]);

  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<ClientPayoutSheet>, done?: (s: ClientPayoutSheet) => string | null) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const data = await fn();
      setSheet(data);
      setNotice(done ? done(data) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const rows = sheet?.rows ?? [];
  const sendable = rows.filter((r) => r.payout_id && r.status !== 'paid' && r.payout_email);
  const unsent = sendable.filter((r) => r.status === 'draft').map((r) => r.payout_id as string);
  const selectedIds = rows.filter((r) => r.payout_id && selected.has(r.payout_id)).map((r) => r.payout_id as string);

  const counts = useMemo(() => {
    const c = { draft: 0, sent: 0, paid: 0 };
    rows.forEach((r) => { if (r.status in c) c[r.status as keyof typeof c] += 1; });
    return c;
  }, [rows]);

  const prepare = () => run('prepare', () => api.post<ClientPayoutSheet>(`/client-payouts/periods/${periodId}/prepare`, {}),
    () => 'Payouts rebuilt from the client ledger with today\'s exchange rates.');

  const sendMany = (ids: string[]) => run('send-many',
    () => api.post<ClientPayoutSheet>(`/client-payouts/periods/${periodId}/send`, { payout_ids: ids }),
    (s) => {
      setSelected(new Set());
      const failed = s.failed ?? [];
      if (failed.length) setError(failed.map((f) => `${f.client}: ${f.error ?? 'failed'}`).join(' · '));
      return `Sent ${s.sent ?? 0} statement${s.sent === 1 ? '' : 's'}.`;
    });

  const sendOne = (r: ClientPayoutRow) => run(`send-${r.payout_id}`,
    () => api.post<ClientPayoutSheet>(`/client-payouts/payouts/${r.payout_id}/send`, {}),
    () => `Statement sent to ${r.client_name}.`);

  const saveRate = () => {
    if (!rateEdit) return;
    const value = n(rateEdit.value);
    if (value <= 0) { setError('The rate must be above zero.'); return; }
    const id = rateEdit.id;
    setRateEdit(null);
    void run(`rate-${id}`, () => api.put<ClientPayoutSheet>(`/client-payouts/payouts/${id}/rate`, { fx_rate: value }),
      () => 'Rate saved.');
  };

  const markPaid = () => {
    if (!payTarget?.payout_id) return;
    const target = payTarget;
    setPayTarget(null);
    void run(`paid-${target.payout_id}`, () => api.post<ClientPayoutSheet>(`/client-payouts/payouts/${target.payout_id}/paid`, {
      reference: payForm.reference.trim() || null,
      paid_at: payForm.paid_on ? `${payForm.paid_on}T12:00:00Z` : null,
    }), () => `${target.client_name} marked paid.`);
  };

  const undoPaid = (r: ClientPayoutRow) => run(`unpaid-${r.payout_id}`,
    () => api.post<ClientPayoutSheet>(`/client-payouts/payouts/${r.payout_id}/unpaid`, {}),
    () => `${r.client_name} is no longer marked paid.`);

  const download = async (r: ClientPayoutRow) => {
    setBusy(`pdf-${r.payout_id}`);
    setError(null);
    try {
      const safe = `${sheet?.period_label ?? ''}-${r.client_name}`.replace(/[^A-Za-z0-9_-]+/g, '-');
      await downloadFile(`/client-payouts/payouts/${r.payout_id}/statement`, `statement-${safe}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const th = 'px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted whitespace-nowrap';
  const periodPaid = sheet?.status === 'paid';

  return (
    <div>
      <PageHeader
        title="Client Payouts"
        description="What each client is owed for the month, in its own currency. Approving the month freezes the exchange rate; then send statements and record payments."
        actions={
          <Link href={`/admin/clients/ledger${periodId ? `?period=${periodId}` : ''}`} className="btn-secondary text-sm py-2 px-4">
            Client ledger
          </Link>
        }
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      <div className="glass-panel p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-auto sm:min-w-[18rem]">
          <PeriodFilter periods={periods} value={periodId} onChange={setPeriodId} variant="select" label="Working month" />
        </div>
        <div className="flex-1" />
        {sheet?.ready && !periodPaid && (
          <button type="button" disabled={busy !== null} onClick={() => void prepare()}
            className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
            {busy === 'prepare' ? <SpinningDots size="sm" /> : <RefreshCw size={12} />} Refresh rates
          </button>
        )}
        {sheet?.ready && (
          <>
            <button type="button" disabled={busy !== null || !selectedIds.length} onClick={() => void sendMany(selectedIds)}
              className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
              <Mail size={12} /> Email selected ({selectedIds.length})
            </button>
            <button type="button" disabled={busy !== null || !unsent.length}
              onClick={() => void sendMany(unsent)}
              className="btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5">
              {busy === 'send-many' ? <SpinningDots size="sm" /> : <Mail size={12} />} Email all unsent
            </button>
          </>
        )}
      </div>

      {sheet && !sheet.ready && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 text-sm">
          <Clock size={14} className="mt-0.5 shrink-0" />
          <span>
            {sheet.period_label} is not approved yet. These amounts are a preview at the latest stored rate.
            Approving the month on the Payroll tab freezes the rates and lets you send statements.
          </span>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-sm">
          <Check size={14} /> {notice}
        </div>
      )}

      {sheet && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KpiCard compact label="Owed to clients" value={usdWithCode(sheet.ready ? sheet.totals.total_usd : rows.reduce((s, r) => s + n(r.amount_usd), 0))} icon={Wallet} accent="gold" />
          <KpiCard compact label="Paid" value={usdWithCode(sheet.totals.paid_usd)} icon={CheckCircle2} />
          <KpiCard compact label="Outstanding" value={usdWithCode(sheet.ready ? sheet.totals.outstanding_usd : rows.reduce((s, r) => s + n(r.amount_usd), 0))} icon={Banknote} accent="blue" />
          <KpiCard compact label="To send · sent · paid" value={`${counts.draft} · ${counts.sent} · ${counts.paid}`} icon={Mail} />
        </div>
      )}

      <div className="glass-panel overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-theme-muted text-sm py-16">No client has a share this month. Enter income on the Client ledger first.</p>
        ) : (
          <table className="w-full text-sm min-w-[1080px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className={th}>
                  <input type="checkbox"
                    checked={sendable.length > 0 && sendable.every((r) => selected.has(r.payout_id as string))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(sendable.map((r) => r.payout_id as string)) : new Set())} />
                </th>
                <th className={`${th} text-left`}>Client</th>
                <th className={`${th} text-right`}>Split on</th>
                <th className={`${th} text-right`}>Client %</th>
                <th className={`${th} text-right`}>Costs</th>
                <th className={`${th} text-right`}>Share {cur}</th>
                <th className={`${th} text-right`}>Rate</th>
                <th className={`${th} text-right`}>To pay</th>
                <th className={`${th} text-left`}>Status</th>
                <th className={`${th} text-left`}>Send to</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = r.payout_id;
                const isPaid = r.status === 'paid';
                const rowBusy = busy !== null && busy.endsWith(id ?? '—');
                return (
                  <tr key={r.client_id} className="border-b border-white/[0.04] last:border-0 align-middle">
                    <td className="px-3 py-2.5">
                      {id && !isPaid && r.payout_email && (
                        <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-white font-medium">
                        {r.client_name}
                        {r.warnings.length > 0 && (
                          <span title={r.warnings.join('\n')} className="text-amber-400"><AlertTriangle size={12} /></span>
                        )}
                      </div>
                      <p className="text-[11px] text-theme-muted">
                        {r.platform}{r.billed_hours ? ` · ${money(r.billed_hours)} h` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-theme-muted">{usd(r.basis)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-theme-muted">{n(r.client_pct).toFixed(2)}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-theme-muted">{n(r.client_costs) ? `-${usd(r.client_costs)}` : '—'}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${n(r.amount_usd) < 0 ? 'text-danger' : 'text-white'}`}>
                      {usd(r.amount_usd)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      {r.currency === 'USD' ? (
                        <span className="text-theme-muted">—</span>
                      ) : rateEdit && rateEdit.id === id ? (
                        <span className="inline-flex items-center gap-1">
                          <input autoFocus type="number" min={0} step="0.000001" value={rateEdit.value}
                            onChange={(e) => setRateEdit({ id: rateEdit.id, value: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveRate(); if (e.key === 'Escape') setRateEdit(null); }}
                            className="input-field !py-1 !px-1 w-24 text-right text-xs" />
                          <button type="button" onClick={saveRate} className="text-emerald-accent"><Check size={12} /></button>
                          <button type="button" onClick={() => setRateEdit(null)} className="text-theme-muted"><X size={12} /></button>
                        </span>
                      ) : (
                        <button type="button" disabled={!id || isPaid || periodPaid}
                          onClick={() => id && setRateEdit({ id, value: r.fx_rate ?? '' })}
                          title={id && !isPaid ? 'Click to set the rate by hand' : undefined}
                          className={`tabular-nums ${r.fx_frozen ? 'text-white' : 'text-theme-muted italic'} disabled:cursor-default`}>
                          {r.fx_rate ? n(r.fx_rate).toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'No rate'}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gold-accent whitespace-nowrap">
                      {r.amount_local != null ? `${money(r.amount_local)} ${r.currency}` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                      {isPaid && (
                        <p className="text-[10px] text-theme-muted mt-1">
                          {r.paid_at ? new Date(r.paid_at).toLocaleDateString() : ''}{r.reference ? ` · ${r.reference}` : ''}
                        </p>
                      )}
                      {r.status === 'sent' && r.sent_at && (
                        <p className="text-[10px] text-theme-muted mt-1">{new Date(r.sent_at).toLocaleDateString()}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <p className={r.payout_email ? 'text-theme-heading' : 'text-amber-400'}>{r.payout_email || 'No payout email'}</p>
                      {(r.payout_method || r.payout_details) && (
                        <p className="text-[10px] text-theme-muted truncate max-w-[14rem]" title={r.payout_details ?? undefined}>
                          {[r.payout_method, r.payout_details].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {rowBusy ? (
                        <SpinningDots size="sm" />
                      ) : id ? (
                        <>
                          <button type="button" disabled={busy !== null} onClick={() => void download(r)}
                            className="btn-secondary text-xs py-1.5 px-2 mr-1 inline-flex items-center gap-1" title="Download statement PDF">
                            <Download size={12} /> PDF
                          </button>
                          {!isPaid && (
                            <>
                              <button type="button" disabled={busy !== null || !r.payout_email} onClick={() => void sendOne(r)}
                                className="btn-secondary text-xs py-1.5 px-2 mr-1 inline-flex items-center gap-1">
                                <Mail size={12} /> {r.status === 'sent' ? 'Resend' : 'Send'}
                              </button>
                              <button type="button" disabled={busy !== null || !r.amount_local}
                                onClick={() => { setPayTarget(r); setPayForm({ reference: '', paid_on: new Date().toISOString().slice(0, 10) }); }}
                                className="btn-primary text-xs py-1.5 px-2 inline-flex items-center gap-1">
                                <Banknote size={12} /> Mark paid
                              </button>
                            </>
                          )}
                          {isPaid && !periodPaid && (
                            <button type="button" disabled={busy !== null} onClick={() => void undoPaid(r)}
                              className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1" title="Undo a mistaken payment record">
                              <Undo2 size={12} /> Undo
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-theme-muted">After approval</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setPayTarget(null); }}>
          <div className="glass-panel w-full max-w-md p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-base font-bold text-white">Mark {payTarget.client_name} paid</h2>
                <p className="text-xs text-theme-muted mt-0.5">
                  {money(payTarget.amount_local)} {payTarget.currency} for {sheet?.period_label}. The amount and this client&apos;s ledger row lock once paid.
                </p>
              </div>
              <button type="button" onClick={() => setPayTarget(null)} className="text-theme-muted hover:text-white"><X size={16} /></button>
            </div>
            <label className="block">
              <span className="text-[10px] font-bold uppercase text-theme-muted">Payment reference</span>
              <input value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Bank or transfer reference" className="input-field mt-1" />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase text-theme-muted">Paid on</span>
              <input type="date" value={payForm.paid_on} onChange={(e) => setPayForm((f) => ({ ...f, paid_on: e.target.value }))}
                className="input-field mt-1" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setPayTarget(null)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
              <button type="button" onClick={markPaid} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
                <Banknote size={14} /> Mark paid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
