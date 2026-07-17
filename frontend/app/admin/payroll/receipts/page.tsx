'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle, ChevronDown, FileText, Mail, Megaphone,
  RefreshCw, ScrollText, Send, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { FINANCE_TABS, PAYROLL_SUBTABS } from '@/components/platform/AdminSectionTabs';
import DataTable from '@/components/platform/DataTable';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PayrollPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface PayrollSummary {
  id: string;
  worker_id: string;
  worker_display_name: string;
  worker_email: string | null;
  worker_country: string;
  final_net: string | number;
  local_currency: string;
}

function slug(s: string) {
  return s.trim().replace(/\s+/g, '-');
}

interface Country { name: string; currency_code: string; is_active: boolean; }

interface EmailLogEntry {
  id: string;
  to_email: string;
  subject: string;
  template: string;
  status: 'sent' | 'failed';
  error: string | null;
  created_at: string;
}

type CommsTab = 'payslips' | 'broadcast' | 'log';

const fmt = (x: string | number | null | undefined) =>
  Number(x ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Banner({ kind, children, onDismiss }: { kind: 'success' | 'error'; children: React.ReactNode; onDismiss?: () => void }) {
  const styles = kind === 'success'
    ? 'bg-emerald-accent/10 border-emerald-accent/30 text-emerald-accent'
    : 'bg-danger/10 border-danger/30 text-danger';
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

function PeriodSelect({ periods, value, onChange }: {
  periods: PayrollPeriod[]; value: string; onChange: (id: string) => void;
}) {
  return (
    <div className="relative w-full max-w-sm">
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field appearance-none pr-8">
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} ({new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()})
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
    </div>
  );
}

// ── Payslips tab ───────────────────────────────────────────────────────────────

function PayslipsTab({ periods }: { periods: PayrollPeriod[] }) {
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? '');
  const [summaries, setSummaries] = useState<PayrollSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attachPdf, setAttachPdf] = useState(false);
  const [overrideEmail, setOverrideEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: number; skipped: number; errors?: string[] } | null>(null);

  useEffect(() => {
    if (!periodId) return;
    setLoading(true); setError(null); setResult(null);
    api.get<PayrollSummary[]>(`/payroll/periods/${periodId}/summaries`)
      .then((rows) => {
        setSummaries(rows);
        setSelected(new Set(rows.map((r) => r.worker_id)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load payslip rows.'))
      .finally(() => setLoading(false));
  }, [periodId]);

  const allSelected = summaries.length > 0 && selected.size === summaries.length;

  function toggle(workerId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId); else next.add(workerId);
      return next;
    });
  }

  async function handleDownload(s: PayrollSummary) {
    const period = periods.find((p) => p.id === periodId);
    const filename = `payslip-${slug(period?.label ?? 'period')}-${slug(s.worker_display_name)}.pdf`;
    setDownloadingId(s.id); setError(null);
    try {
      await downloadFile(`/payroll/summaries/${s.id}/payslip.pdf`, filename);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate PDF receipt.');
    } finally { setDownloadingId(null); }
  }

  async function handleSend() {
    if (selected.size === 0) return;
    setSending(true); setError(null); setResult(null);
    try {
      const override = overrideEmail.trim();
      const res = await api.post<{ sent: number; failed: number; skipped: number; errors?: string[] }>('/communications/payslips/send', {
        payroll_period_id: periodId,
        ...(allSelected ? {} : { worker_ids: Array.from(selected) }),
        attach_pdf: attachPdf,
        ...(override && override.includes('@') ? { override_email: override } : {}),
      });
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send payslips.');
    } finally { setSending(false); }
  }

  if (periods.length === 0) {
    return <p className="text-theme-muted text-sm">No payroll periods available. Create and calculate a period first.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4 mb-5">
        <div className="flex-1 min-w-[16rem]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Payroll Period</label>
          <PeriodSelect periods={periods} value={periodId} onChange={setPeriodId} />
        </div>
        <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer select-none pb-2.5">
          <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)}
            className="accent-emerald-400 w-3.5 h-3.5" />
          <span className="flex items-center gap-1"><FileText size={12} /> Attach PDF payslip</span>
        </label>
        <button type="button" onClick={handleSend} disabled={sending || selected.size === 0}
          className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-50">
          {sending ? <SpinningDots size="sm" /> : <Send size={14} />}
          Send to {selected.size} worker{selected.size !== 1 ? 's' : ''}
        </button>
      </div>

      <div className="mb-4 max-w-md">
        <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">
          Send to this email instead (optional)
        </label>
        <input
          type="email"
          value={overrideEmail}
          onChange={(e) => setOverrideEmail(e.target.value)}
          placeholder="you@example.com — test delivery to any address"
          className="input-field"
        />
        <p className="text-[11px] text-theme-muted mt-1">
          When set, the selected payslip(s) are emailed to this address instead of each worker&apos;s own email. Great for a quick delivery test.
        </p>
      </div>

      <p className="text-[11px] text-theme-muted mb-4 flex items-center gap-1.5">
        <Mail size={12} className="text-gold-accent" />
        Payslip emails send from gsdeck.com via Resend. HTML email is the default; PDF attachment is optional.
      </p>

      {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
      {result && (
        <Banner kind={result.failed > 0 ? 'error' : 'success'} onDismiss={() => setResult(null)}>
          <span className="block">
            Payslips dispatched — {result.sent} sent, {result.failed} failed, {result.skipped} skipped.
          </span>
          {result.errors && result.errors.length > 0 && (
            <span className="block mt-1 opacity-90">
              {result.errors.join(' · ')}
              {result.errors.some((e) => e.includes('RESEND_API_KEY') || e.toLowerCase().includes('domain'))
                ? ' — Check RESEND_API_KEY and RESEND_FROM_EMAIL in backend/.env (verified domain in Resend; app need not be hosted on that domain).'
                : ''}
            </span>
          )}
        </Banner>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : (
        <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(summaries.map((s) => s.worker_id)))}
                      className="accent-emerald-400 w-3.5 h-3.5" />
                  </th>
                  {['Worker', 'Email', 'Country', 'Final Net'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant">{h}</th>
                  ))}
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {summaries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-brand-on-surface-variant">
                      No payslip rows for this period. Run Calculate on the Payroll page first.
                    </td>
                  </tr>
                ) : (
                  summaries.map((s) => (
                    <tr key={s.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer"
                      onClick={() => toggle(s.worker_id)}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(s.worker_id)} onChange={() => toggle(s.worker_id)}
                          onClick={(e) => e.stopPropagation()} className="accent-emerald-400 w-3.5 h-3.5" />
                      </td>
                      <td className="px-4 py-3 font-medium text-theme-heading">{s.worker_display_name}</td>
                      <td className="px-4 py-3 text-theme-muted">{s.worker_email ?? <span className="text-danger text-xs">no email</span>}</td>
                      <td className="px-4 py-3 text-theme-muted">{s.worker_country}</td>
                      <td className="px-4 py-3 font-bold text-emerald-accent">{fmt(s.final_net)} {s.local_currency}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); void handleDownload(s); }}
                          disabled={downloadingId === s.id}
                          className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1.5 disabled:opacity-50">
                          {downloadingId === s.id ? <SpinningDots size="sm" /> : <FileText size={12} />}
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Broadcast tab ──────────────────────────────────────────────────────────────

function BroadcastTab({ countries }: { countries: Country[] }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [workerType, setWorkerType] = useState<'' | 'gs_registered' | 'partner_worker'>('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ recipients: number; sent: number; failed: number; skipped: number; errors?: string[] } | null>(null);

  function toggleCountry(name: string) {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function sendBroadcast(opts: { skipWorkers: boolean }) {
    const extra = testEmail.trim() && testEmail.includes('@') ? [testEmail.trim()] : [];
    if (opts.skipWorkers && !extra.length) {
      setError('Enter a test email address first, then use Send test only.');
      return;
    }

    const scope = selectedCountries.size > 0 ? `${selectedCountries.size} selected countr${selectedCountries.size === 1 ? 'y' : 'ies'}` : 'all countries';
    const typeLabel = workerType === 'gs_registered' ? 'GS Members' : workerType === 'partner_worker' ? 'Partners' : 'all worker types';
    const confirmMsg = opts.skipWorkers
      ? `Send test email only to ${extra[0]}? (workers will not be emailed)`
      : `Broadcast "${title}" to ${typeLabel} in ${scope}${activeOnly ? ' (active only)' : ''}${extra.length ? ` (+ test ${extra[0]})` : ''}?`;
    if (!window.confirm(confirmMsg)) return;

    setSending(true); setError(null); setResult(null);
    try {
      const res = await api.post<{ recipients: number; sent: number; failed: number; skipped: number; errors?: string[] }>('/communications/broadcast', {
        title,
        message,
        ...(selectedCountries.size > 0 ? { countries: Array.from(selectedCountries) } : {}),
        ...(workerType ? { worker_type: workerType } : {}),
        active_only: activeOnly,
        ...(extra.length ? { extra_emails: extra } : {}),
        ...(opts.skipWorkers ? { skip_workers: true } : {}),
      });
      setResult(res);
      setTitle(''); setMessage(''); setTestEmail('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send broadcast.';
      setError(
        msg.includes('500') || msg.toLowerCase().includes('timeout')
          ? `${msg} — If this was a full broadcast, check Delivery Log; emails may have been sent before the UI timed out. Prefer “Send test only” for local checks.`
          : msg,
      );
    } finally { setSending(false); }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await sendBroadcast({ skipWorkers: false });
  }

  return (
    <div className="max-w-3xl">
      {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
      {result && (
        <Banner kind={result.failed > 0 ? 'error' : 'success'} onDismiss={() => setResult(null)}>
          <span className="block">
            Broadcast complete — {result.recipients} recipients, {result.sent} sent, {result.failed} failed, {result.skipped} skipped.
          </span>
          {result.errors && result.errors.length > 0 && (
            <span className="block mt-1 opacity-90">
              {result.errors.join(' · ')}
              {result.errors.some((e) => e.includes('RESEND_API_KEY') || e.toLowerCase().includes('domain'))
                ? ' — Check RESEND_API_KEY and RESEND_FROM_EMAIL in backend/.env.'
                : ''}
            </span>
          )}
        </Banner>
      )}

      <form onSubmit={handleSend} className="glass-panel p-6 space-y-5">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Title</label>
          <input required value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Payroll schedule update" className="input-field" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Message</label>
          <textarea required rows={5} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="Write the announcement…" className="input-field resize-none" />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-2 block">
            Countries {selectedCountries.size === 0 && <span className="normal-case font-normal">(none selected = all countries)</span>}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {countries.map((c) => {
              const on = selectedCountries.has(c.name);
              return (
                <button key={c.name} type="button" onClick={() => toggleCountry(c.name)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                    on
                      ? 'border-emerald-accent/40 bg-emerald-accent/15 text-emerald-accent'
                      : 'border-white/10 text-theme-muted hover:border-emerald-accent/20 hover:text-theme-heading'
                  }`}>
                  {c.name}
                </button>
              );
            })}
            {countries.length === 0 && <span className="text-xs text-theme-muted">No countries configured.</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Worker Type</label>
            <div className="relative">
              <select value={workerType} onChange={(e) => setWorkerType(e.target.value as typeof workerType)}
                className="input-field appearance-none pr-8 w-44">
                <option value="">All</option>
                <option value="gs_registered">GS Members</option>
                <option value="partner_worker">Partners</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer select-none mt-4">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)}
              className="accent-emerald-400 w-3.5 h-3.5" />
            Active workers only
          </label>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">
            Send test to (optional)
          </label>
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com"
            className="input-field max-w-md"
          />
          <p className="text-[11px] text-theme-muted mt-1">
            Use <span className="text-theme-heading">Send test only</span> to verify Resend without emailing all workers (avoids UI timeouts on large lists).
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={sending || !testEmail.trim()}
            onClick={() => void sendBroadcast({ skipWorkers: true })}
            className="btn-secondary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60"
          >
            Send test only
          </button>
          <button type="submit" disabled={sending} className="btn-primary text-sm py-2 px-5 flex items-center gap-2 disabled:opacity-60">
            {sending ? <SpinningDots size="sm" /> : <Megaphone size={14} />} Send Broadcast
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Delivery log tab ───────────────────────────────────────────────────────────

function DeliveryLogTab({ periods }: { periods: PayrollPeriod[] }) {
  const [template, setTemplate] = useState<'' | 'payslip' | 'broadcast' | 'notification'>('');
  const [periodId, setPeriodId] = useState('');
  const [entries, setEntries] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (template) params.set('template', template);
    if (periodId) params.set('payroll_period_id', periodId);
    const qs = params.toString();
    api.get<EmailLogEntry[]>(`/communications/log${qs ? `?${qs}` : ''}`)
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load delivery log.'))
      .finally(() => setLoading(false));
  }, [template, periodId]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => entries.map((e) => ({ ...e, _e: e })) as unknown as Record<string, unknown>[], [entries]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <select value={template} onChange={(e) => setTemplate(e.target.value as typeof template)}
            className="input-field appearance-none pr-8 !py-2 w-44">
            <option value="">Template: All</option>
            <option value="payslip">Payslips</option>
            <option value="broadcast">Broadcasts</option>
            <option value="notification">Notifications</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
        </div>
        <div className="relative">
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
            className="input-field appearance-none pr-8 !py-2 w-56">
            <option value="">Period: All</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
        </div>
        <button type="button" onClick={load} className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
          <RefreshCw size={12} /> Refresh
        </button>
        <span className="text-xs text-theme-muted ml-1">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <Banner kind="error">{error}</Banner>
      ) : (
        <DataTable
          columns={[
            { key: 'created_at', header: 'Sent At', render: (r) => new Date(r.created_at as string).toLocaleString() },
            { key: 'to_email', header: 'Recipient' },
            { key: 'subject', header: 'Subject' },
            {
              key: 'template', header: 'Template',
              render: (r) => <span className="capitalize text-theme-muted">{r.template as string}</span>,
            },
            {
              key: 'status', header: 'Status',
              render: (r) => {
                const e = (r as { _e: EmailLogEntry })._e;
                return e.status === 'sent' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-emerald-accent/15 text-emerald-accent border-emerald-accent/30">
                    <CheckCircle size={9} /> Sent
                  </span>
                ) : (
                  <span title={e.error ?? undefined}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-danger/15 text-danger border-danger/30">
                    <AlertCircle size={9} /> Failed
                  </span>
                );
              },
            },
            {
              key: 'error', header: 'Error',
              render: (r) => (r.error ? <span className="text-danger text-xs">{r.error as string}</span> : '—'),
            },
          ]}
          data={rows}
          emptyMessage="No delivery log entries match the current filters."
        />
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CommunicationsPage() {
  const [tab, setTab] = useState<CommsTab>('payslips');
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<PayrollPeriod[]>('/payroll/periods'),
      api.get<Country[]>('/currencies/countries'),
    ])
      .then(([p, c]) => { setPeriods(p); setCountries(c); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load data.'))
      .finally(() => setLoading(false));
  }, []);

  const TABS: { key: CommsTab; label: string; icon: React.ReactNode }[] = [
    { key: 'payslips', label: 'Payslips', icon: <Mail size={13} /> },
    { key: 'broadcast', label: 'Broadcast', icon: <Megaphone size={13} /> },
    { key: 'log', label: 'Delivery Log', icon: <ScrollText size={13} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Communications"
        description="Send payslip emails, broadcast announcements to workers, and audit email deliveries."
      />
      <AdminSectionTabs tabs={FINANCE_TABS} />
      <AdminSectionTabs tabs={PAYROLL_SUBTABS} />

      <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 w-fit mb-6">
        {TABS.map(({ key, label, icon }) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === key ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-theme-heading'
            }`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <Banner kind="error">{error}</Banner>
      ) : (
        <>
          {tab === 'payslips' && <PayslipsTab periods={periods} />}
          {tab === 'broadcast' && <BroadcastTab countries={countries} />}
          {tab === 'log' && <DeliveryLogTab periods={periods} />}
        </>
      )}
    </div>
  );
}
