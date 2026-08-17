'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, ArrowLeft, Ban, CheckCircle, ChevronDown, ChevronLeft, ChevronRight,
  Eye, Mail, RefreshCw, Search, Send, X,
} from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import EmailDetailModal, { DeliveryBadge, type EmailLogEntry } from '@/components/admin/EmailDetailModal';
import { api } from '@/lib/api';

interface PayrollPeriod { id: string; label: string; }

interface HistoryStats {
  total: number;
  accepted: number;
  rejected: number;
  delivered: number;
  opened: number;
  bounced: number;
  complained: number;
  in_flight: number;
}

interface HistoryResponse {
  items: EmailLogEntry[];
  total: number;
  limit: number;
  offset: number;
  stats: HistoryStats;
}

const PAGE_SIZE = 50;

const EMPTY_STATS: HistoryStats = {
  total: 0, accepted: 0, rejected: 0, delivered: 0,
  opened: 0, bounced: 0, complained: 0, in_flight: 0,
};

/** Every email the platform has sent, with what the provider reported back. */
export default function EmailHistoryPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [rows, setRows] = useState<EmailLogEntry[]>([]);
  const [stats, setStats] = useState<HistoryStats>(EMPTY_STATS);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [template, setTemplate] = useState('');
  const [status, setStatus] = useState('');
  const [delivery, setDelivery] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api.get<PayrollPeriod[]>('/payroll/periods').then(setPeriods).catch(() => setPeriods([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setOffset(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (template) params.set('template', template);
    if (status) params.set('status', status);
    if (delivery) params.set('last_event', delivery);
    if (periodId) params.set('payroll_period_id', periodId);
    if (dateFrom) params.set('date_from', `${dateFrom}T00:00:00`);
    if (dateTo) params.set('date_to', `${dateTo}T23:59:59`);
    return params.toString();
  }, [debouncedSearch, template, status, delivery, periodId, dateFrom, dateTo, offset]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<HistoryResponse>(`/communications/log?${query}`);
      setRows(data.items);
      setStats(data.stats);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load email history.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  async function syncFromProvider() {
    setSyncing(true);
    setError(null);
    setNote(null);
    try {
      const res = await api.post<{ checked: number; updated: number; error: string | null }>(
        '/communications/log/sync', {},
      );
      setNote(
        res.checked === 0
          ? 'Nothing to check — every traceable message already has a final delivery state.'
          : `Checked ${res.checked} message${res.checked === 1 ? '' : 's'}, updated ${res.updated}.`
          + (res.error ? ` Last provider error: ${res.error}` : ''),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach the email provider.');
    } finally {
      setSyncing(false);
    }
  }

  function resetFilters() {
    setSearch(''); setDebouncedSearch(''); setTemplate(''); setStatus('');
    setDelivery(''); setPeriodId(''); setDateFrom(''); setDateTo(''); setOffset(0);
  }

  const filtered = Boolean(debouncedSearch || template || status || delivery || periodId || dateFrom || dateTo);
  const problems = stats.bounced + stats.complained + stats.rejected;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <div>
      <PageHeader
        title="Email History"
        description="Every payslip, announcement and notification this platform has sent, with the provider's delivery outcome for each one."
      />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Link href="/admin/payroll/receipts"
          className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
          <ArrowLeft size={12} /> Back to Communications
        </Link>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw size={12} /> Reload
        </button>
        <button type="button" onClick={() => void syncFromProvider()} disabled={syncing}
          className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5 disabled:opacity-50">
          {syncing ? <SpinningDots size="sm" /> : <Send size={12} />} Sync delivery status
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <KpiCard compact label="Emails" value={stats.total} icon={Mail} />
        <KpiCard compact label="Delivered" value={stats.delivered} icon={CheckCircle} accent="emerald"
          highlight={stats.delivered > 0} />
        <KpiCard compact label="Opened" value={stats.opened} icon={Eye} accent="blue" />
        <KpiCard compact label="In flight" value={stats.in_flight} icon={Send} accent="gold" />
        <KpiCard compact label="Problems" value={problems} icon={Ban} accent="danger"
          highlight={problems > 0} />
      </div>

      <div className="glass-panel rounded-2xl border border-white/5 p-4 mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative flex-1 min-w-[14rem]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipient or subject…"
              className="input-field !py-2 pl-9" />
          </div>

          <div className="relative">
            <select value={template} onChange={(e) => { setTemplate(e.target.value); setOffset(0); }}
              className="input-field appearance-none pr-8 !py-2 w-40">
              <option value="">All types</option>
              <option value="payslip">Payslips</option>
              <option value="broadcast">Announcements</option>
              <option value="notification">Notifications</option>
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
          </div>

          <div className="relative">
            <select value={delivery} onChange={(e) => { setDelivery(e.target.value); setOffset(0); }}
              className="input-field appearance-none pr-8 !py-2 w-44">
              <option value="">Any delivery state</option>
              <option value="delivered">Delivered</option>
              <option value="opened">Opened</option>
              <option value="clicked">Clicked</option>
              <option value="unknown">Awaiting confirmation</option>
              <option value="delivery_delayed">Delayed</option>
              <option value="problem">Bounced or spam</option>
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
          </div>

          <div className="relative">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}
              className="input-field appearance-none pr-8 !py-2 w-36">
              <option value="">Accepted &amp; rejected</option>
              <option value="sent">Accepted</option>
              <option value="failed">Rejected</option>
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
          </div>

          <div className="relative">
            <select value={periodId} onChange={(e) => { setPeriodId(e.target.value); setOffset(0); }}
              className="input-field appearance-none pr-8 !py-2 w-44">
              <option value="">Any work period</option>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
          </div>

          <div className="flex items-center gap-1.5">
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
              className="input-field !py-2 w-36" aria-label="From date" />
            <span className="text-xs text-theme-muted">to</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
              className="input-field !py-2 w-36" aria-label="To date" />
          </div>

          {filtered && (
            <button type="button" onClick={resetFilters}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border text-xs mb-4 bg-danger/10 border-danger/30 text-danger">
          <AlertCircle size={14} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="opacity-70 hover:opacity-100"><X size={12} /></button>
        </div>
      )}
      {note && (
        <div className="flex items-center gap-2 p-3 rounded-xl border text-xs mb-4 bg-emerald-accent/10 border-emerald-accent/30 text-emerald-accent">
          <CheckCircle size={14} className="shrink-0" />
          <span className="flex-1">{note}</span>
          <button type="button" onClick={() => setNote(null)} className="opacity-70 hover:opacity-100"><X size={12} /></button>
        </div>
      )}

      <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-20"><SpinningDots size="lg" className="text-emerald-accent" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  {['Sent', 'Recipient', 'Subject', 'Type', 'Accepted', 'Delivery'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant">{h}</th>
                  ))}
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-brand-on-surface-variant">
                      {filtered ? 'No emails match these filters.' : 'Nothing sent yet.'}
                    </td>
                  </tr>
                ) : rows.map((r) => (
                  <tr key={r.id}
                    onClick={() => setOpenId(r.id)}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-theme-muted whitespace-nowrap text-xs">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-medium text-theme-heading truncate max-w-[16rem]">{r.to_email}</span>
                      {r.worker_name && <span className="block text-[11px] text-theme-muted truncate">{r.worker_name}</span>}
                    </td>
                    <td className="px-4 py-3 text-theme-muted">
                      <span className="block truncate max-w-[18rem]">{r.subject}</span>
                      {r.period_label && <span className="block text-[11px] text-gold-accent">{r.period_label}</span>}
                    </td>
                    <td className="px-4 py-3 text-theme-muted capitalize text-xs">{r.template}</td>
                    <td className="px-4 py-3">
                      {r.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-emerald-accent/15 text-emerald-accent border-emerald-accent/30">
                          <CheckCircle size={9} /> Yes
                        </span>
                      ) : (
                        <span title={r.error ?? undefined}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-danger/15 text-danger border-danger/30">
                          <AlertCircle size={9} /> No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3"><DeliveryBadge event={r.last_event} /></td>
                    <td className="px-4 py-3 text-right">
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}
                        aria-label={`Open details for ${r.to_email}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-theme-muted transition-colors hover:bg-white/5 hover:text-emerald-accent">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-4 py-3">
          <span className="text-xs text-theme-muted">
            {total === 0 ? 'No entries' : `Showing ${from}–${to} of ${total}`}
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 disabled:opacity-40">
              <ChevronLeft size={12} /> Newer
            </button>
            <button type="button" disabled={to >= total || loading}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 disabled:opacity-40">
              Older <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-theme-muted mt-4 flex items-start gap-1.5 max-w-3xl">
        <AlertCircle size={12} className="shrink-0 mt-0.5 text-gold-accent" />
        <span>
          <span className="text-theme-heading">Accepted</span> means the platform handed the message
          to the provider. <span className="text-theme-heading">Delivery</span> is what the provider
          reported afterwards — delivered mail can still sit in a recipient&apos;s Spam or Promotions
          folder. Events arrive automatically once the Resend webhook is configured; until then use
          Sync delivery status.
        </span>
      </p>

      {openId && (
        <EmailDetailModal logId={openId} onClose={() => setOpenId(null)} onUpdated={() => void load()} />
      )}
    </div>
  );
}
