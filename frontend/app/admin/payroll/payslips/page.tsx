'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Eye, FileText, Mail, Send, UserRound } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import PeriodFilter from '@/components/platform/PeriodFilter';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { fetchAuthenticatedBlob } from '@/lib/download';
import { formatLocalAndUsd, formatMoneyAmount, useMoneyDisplay } from '@/lib/money';
import { pickCurrentPeriod } from '@/lib/periods';

interface Period { id: string; label: string; start_date: string; end_date: string; status: string; is_current?: boolean }

interface PayslipRow {
  id: string;
  worker_id: string;
  worker_display_name?: string | null;
  worker_country?: string | null;
  worker_email?: string | null;
  final_net: string | number;
  gross_earned: string | number;
  local_currency: string;
  final_confirmed_at?: string | null;
}

type Channel = 'account' | 'email' | 'both';

const CHANNELS: { key: Channel; label: string; icon: typeof Send; hint: string }[] = [
  { key: 'account', label: 'Send to account', icon: UserRound, hint: 'Payslip appears in the worker portal with a “Payslip ready” notification' },
  { key: 'email', label: 'Send to email', icon: Mail, hint: 'Emails the payslip to the worker' },
  { key: 'both', label: 'Both', icon: Send, hint: 'Portal notification and email' },
];

/** All payslips for a month: net pay, view the PDF, and send to account / email / both. */
export default function PayslipsPage() {
  useMoneyDisplay();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<Channel>('both');
  const [attachPdf, setAttachPdf] = useState(true);
  const [resend, setResend] = useState(false);
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    api.get<Period[]>('/payroll/periods')
      .then((list) => {
        setPeriods(list);
        const fromUrl = new URLSearchParams(window.location.search).get('period');
        const pick = list.find((p) => p.id === fromUrl) ?? pickCurrentPeriod(list) ?? list[0];
        if (pick) setPeriodId(pick.id); else setLoading(false);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Could not load months.'); setLoading(false); });
  }, []);

  const load = useCallback(() => {
    if (!periodId) return;
    setLoading(true);
    setError(null);
    api.get<PayslipRow[]>(`/payroll/periods/${periodId}/summaries`)
      .then((r) => { setRows(r); setSelected(new Set()); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load payslips.'))
      .finally(() => setLoading(false));
  }, [periodId]);

  useEffect(() => { load(); }, [load]);

  const period = periods.find((p) => p.id === periodId) ?? null;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.worker_id));
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const totals = useMemo(() => {
    const byCur = new Map<string, number>();
    for (const r of rows) byCur.set(r.local_currency, (byCur.get(r.local_currency) ?? 0) + Number(r.final_net ?? 0));
    return [...byCur.entries()];
  }, [rows]);

  // Open the PDF in a new tab. The tab is opened first (inside the click) so popup blockers allow it.
  const viewPdf = async (row: PayslipRow) => {
    const tab = window.open('', '_blank');
    setOpening(row.id);
    try {
      const blob = await fetchAuthenticatedBlob(`/payroll/summaries/${row.id}/payslip.pdf?inline=true`);
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      if (tab) tab.location.href = url; else window.open(url, '_blank');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : 'Could not open the payslip.');
    } finally {
      setOpening(null);
    }
  };

  const send = async () => {
    if (!period) return;
    const ids = selected.size ? [...selected] : null;
    const who = ids ? `${ids.length} selected worker${ids.length === 1 ? '' : 's'}` : `all ${rows.length} workers`;
    if (!window.confirm(`${CHANNELS.find((c) => c.key === channel)?.label}: payslips for ${who} — ${period.label}?`)) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ queued: number; notified?: number; skipped_no_email?: number; skipped_already_sent?: number }>(
        '/communications/payslips/send',
        {
          payroll_period_id: period.id,
          worker_ids: ids,
          send_email: channel !== 'account',
          notify_in_app: channel !== 'email',
          attach_pdf: channel !== 'account' && attachPdf,
          force_resend: resend,
        },
      );
      if (channel === 'account') {
        setNotice(`Sent to ${res.notified ?? 0} worker account${res.notified === 1 ? '' : 's'} — they’ll see “Payslip ready”.`);
      } else {
        const parts = [`${res.queued} email${res.queued === 1 ? '' : 's'} queued`];
        if (channel === 'both') parts.push('and portal notifications sent');
        if (res.skipped_already_sent) parts.push(`· ${res.skipped_already_sent} already emailed (tick “Send again” to resend)`);
        if (res.skipped_no_email) parts.push(`· ${res.skipped_no_email} with no email address`);
        setNotice(`${parts.join(' ')}. Track delivery under Payslip emails.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sending failed.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Payslips"
        actions={
          <Link href="/admin/payroll" className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
            <ArrowLeft size={14} /> Finance
          </Link>
        }
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      <div className="glass-panel p-4 mb-4 flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-auto sm:min-w-[16rem]">
          <PeriodFilter periods={periods} value={periodId} onChange={setPeriodId} variant="select" label="Working month" />
        </div>
        <div className="flex-1" />
        <div role="radiogroup" aria-label="Send payslips to" className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {CHANNELS.map(({ key, label, icon: Icon, hint }) => (
            <button key={key} type="button" role="radio" aria-checked={channel === key} title={hint}
              onClick={() => setChannel(key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                channel === key ? 'bg-emerald-accent/20 text-emerald-accent' : 'text-theme-muted hover:text-theme-heading'
              }`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        {channel !== 'account' && (
          <label className="flex items-center gap-1.5 text-xs text-theme-muted">
            <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} className="accent-emerald-400" />
            Attach PDF
          </label>
        )}
        {channel !== 'account' && (
          <label className="flex items-center gap-1.5 text-xs text-theme-muted" title="Email workers who were already emailed this month">
            <input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} className="accent-emerald-400" />
            Send again
          </label>
        )}
        <button type="button" onClick={() => void send()} disabled={sending || !rows.length}
          className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50">
          {sending ? <SpinningDots size="sm" /> : <Send size={14} />}
          {selected.size ? `Send to ${selected.size} selected` : 'Send to all'}
        </button>
      </div>

      {error && <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {notice && <p className="mb-3 rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 px-3 py-2 text-sm text-emerald-accent">{notice}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : !rows.length ? (
        <div className="glass-panel p-8 text-center text-sm text-theme-muted">
          <FileText size={22} className="mx-auto mb-2" />
          No payslips for this month yet — calculate it on the Finance page first.
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02] text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                  <th className="px-3 py-3 w-9 text-left">
                    <input type="checkbox" checked={allSelected} aria-label="Select all workers" className="accent-emerald-400"
                      onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.worker_id)))} />
                  </th>
                  <th className="px-3 py-3 text-left">Worker</th>
                  <th className="px-3 py-3 text-left">Country</th>
                  <th className="px-3 py-3 text-left">Email</th>
                  <th className="px-3 py-3 text-right">Final net</th>
                  <th className="px-3 py-3 text-left">Final value</th>
                  <th className="px-3 py-3 text-center">Payslip</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(r.worker_id)} onChange={() => toggle(r.worker_id)}
                        aria-label={`Select ${r.worker_display_name ?? 'worker'}`} className="accent-emerald-400" />
                    </td>
                    <td className="px-3 py-2.5 font-medium text-theme-heading">{r.worker_display_name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-theme-muted">{r.worker_country ?? '—'}</td>
                    <td className="px-3 py-2.5 text-theme-muted">{r.worker_email ?? <span className="text-amber-400">No email</span>}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${Number(r.final_net) < 0 ? 'text-danger' : 'text-emerald-accent'}`}>
                      {formatLocalAndUsd(r.final_net, r.local_currency)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {r.final_confirmed_at ? <span className="text-emerald-accent">Confirmed</span> : <span className="text-theme-muted">Not confirmed</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button type="button" onClick={() => void viewPdf(r)} disabled={opening === r.id}
                        title="Open this payslip (PDF) in a new tab"
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-emerald-accent disabled:opacity-50"
                        style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                        {opening === r.id ? <SpinningDots size="sm" /> : <Eye size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-white/[0.03] border-t border-white/10">
                  <td colSpan={4} className="px-3 py-2.5 font-bold text-theme-heading">Total net · {rows.length} workers</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-emerald-accent" colSpan={1}>
                    {totals.map(([cur, sum]) => <div key={cur}>{cur} {formatMoneyAmount(sum, cur)}</div>)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
