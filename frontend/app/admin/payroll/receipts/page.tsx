'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, AtSign, CheckCircle, ChevronDown, FileText, Mail, Megaphone,
  RefreshCw, ScrollText, Send, Users, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import PeriodFilter from '@/components/platform/PeriodFilter';
import SpinningDots from '@/components/shared/SpinningDots';
import EmailJobProgress, { RecentEmailJobs } from '@/components/admin/EmailJobProgress';
import EmailRecipientsInput, { isValidRecipient } from '@/components/admin/EmailRecipientsInput';
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

type CommsTab = 'payslips' | 'broadcast';

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
  const [jobId, setJobId] = useState<string | null>(null);
  const [queuedNote, setQueuedNote] = useState<string | null>(null);
  const [jobsKey, setJobsKey] = useState(0);
  const [forceResend, setForceResend] = useState(false);

  useEffect(() => {
    if (!periodId) return;
    setLoading(true); setError(null); setJobId(null); setQueuedNote(null);
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
    setSending(true); setError(null); setQueuedNote(null);
    try {
      const override = overrideEmail.trim();
      if (override && !isValidRecipient(override)) {
        setError('That redirect address is not a valid inbox. Clear it to email each worker instead.');
        return;
      }
      // The request only queues the job; progress arrives from polling below.
      const res = await api.post<{
        job_id: string; queued: number; skipped_no_email: number; skipped_already_sent: number;
      }>('/communications/payslips/send', {
        payroll_period_id: periodId,
        ...(allSelected ? {} : { worker_ids: Array.from(selected) }),
        attach_pdf: attachPdf,
        force_resend: forceResend,
        ...(override ? { override_email: override } : {}),
      });
      setJobId(res.job_id);
      setJobsKey((k) => k + 1);
      const notes: string[] = [`Sending ${res.queued} payslip${res.queued === 1 ? '' : 's'} now.`];
      if (res.skipped_already_sent > 0) {
        notes.push(`${res.skipped_already_sent} already emailed for this period (tick “Re-send” to include them).`);
      }
      if (res.skipped_no_email > 0) {
        notes.push(`${res.skipped_no_email} skipped with no valid email address.`);
      }
      setQueuedNote(notes.join(' '));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to queue payslips.');
    } finally { setSending(false); }
  }

  if (periods.length === 0) {
    return <p className="text-theme-muted text-sm">No payroll periods available. Create and calculate a period first.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4 mb-5">
        <div className="flex-1 min-w-[16rem]">
          <PeriodFilter
            periods={periods}
            value={periodId}
            onChange={setPeriodId}
            variant="select"
            label="Working month"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer select-none pb-2.5">
          <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)}
            className="accent-emerald-400 w-3.5 h-3.5" />
          <span className="flex items-center gap-1"><FileText size={12} /> Attach PDF payslip</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer select-none pb-2.5">
          <input type="checkbox" checked={forceResend} onChange={(e) => setForceResend(e.target.checked)}
            className="accent-emerald-400 w-3.5 h-3.5" />
          <span className="flex items-center gap-1"><RefreshCw size={12} /> Re-send to already emailed</span>
        </label>
        <button type="button" onClick={handleSend} disabled={sending || selected.size === 0}
          className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-50">
          {sending ? <SpinningDots size="sm" /> : <Send size={14} />}
          Email payslips to {selected.size} worker{selected.size !== 1 ? 's' : ''}
        </button>
      </div>

      {attachPdf && (
        <p className="text-[11px] text-gold-accent mb-4 flex items-start gap-1.5">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          PDF attachments send one email per worker instead of 100 per call, so large runs take
          noticeably longer. Leave it off unless the attachment is required — workers can always
          download the PDF from their wallet.
        </p>
      )}

      <div className="mb-4 max-w-md">
        <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">
          Redirect all payslips to one address (optional)
        </label>
        <input
          type="email"
          value={overrideEmail}
          onChange={(e) => setOverrideEmail(e.target.value)}
          placeholder="finance@company.com"
          className="input-field"
        />
        <p className="text-[11px] text-theme-muted mt-1">
          Leave empty to email each worker their own payslip. When set, every selected payslip goes
          to this address instead — used for finance review or verifying delivery.
        </p>
      </div>

      <p className="text-[11px] text-theme-muted mb-4 flex items-center gap-1.5">
        <Mail size={12} className="text-gold-accent" />
        Payslip emails send from gsdeck.com via Resend. Sending runs in the background, so you can
        leave this page — progress keeps updating when you come back.
      </p>

      {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
      {queuedNote && <Banner kind="success" onDismiss={() => setQueuedNote(null)}>{queuedNote}</Banner>}

      {jobId && <EmailJobProgress jobId={jobId} onDismiss={() => setJobId(null)} />}
      <RecentEmailJobs kind="payslip" onSelect={setJobId} refreshKey={jobsKey} />

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

type Audience = 'workers' | 'custom';

function BroadcastTab({ countries }: { countries: Country[] }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<Audience>('workers');
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [workerType, setWorkerType] = useState<'' | 'gs_registered' | 'partner_worker'>('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [queuedNote, setQueuedNote] = useState<string | null>(null);
  const [jobsKey, setJobsKey] = useState(0);

  const customOnly = audience === 'custom';

  function toggleCountry(name: string) {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (customOnly && extraEmails.length === 0) {
      setError('Add at least one email address, or switch the audience back to workers.');
      return;
    }

    const scope = selectedCountries.size > 0
      ? `${selectedCountries.size} selected countr${selectedCountries.size === 1 ? 'y' : 'ies'}`
      : 'all countries';
    const typeLabel = workerType === 'gs_registered' ? 'GS Members'
      : workerType === 'partner_worker' ? 'Partners' : 'all worker types';
    const extraNote = extraEmails.length
      ? ` plus ${extraEmails.length} typed address${extraEmails.length === 1 ? '' : 'es'}`
      : '';
    const confirmMsg = customOnly
      ? `Send "${title}" to ${extraEmails.length} typed address${extraEmails.length === 1 ? '' : 'es'}? Workers will not be emailed.`
      : `Send "${title}" to ${typeLabel} in ${scope}${activeOnly ? ' (active only)' : ''}${extraNote}?`;
    if (!window.confirm(confirmMsg)) return;

    setSending(true); setError(null); setQueuedNote(null);
    try {
      const res = await api.post<{ job_id: string; queued: number; skipped_no_email: number }>('/communications/broadcast', {
        title,
        message,
        ...(!customOnly && selectedCountries.size > 0 ? { countries: Array.from(selectedCountries) } : {}),
        ...(!customOnly && workerType ? { worker_type: workerType } : {}),
        active_only: customOnly ? false : activeOnly,
        ...(extraEmails.length ? { extra_emails: extraEmails } : {}),
        ...(customOnly ? { skip_workers: true } : {}),
      });
      setJobId(res.job_id);
      setJobsKey((k) => k + 1);
      setQueuedNote(
        `Sending to ${res.queued} recipient${res.queued === 1 ? '' : 's'} now.`
        + (res.skipped_no_email > 0 ? ` ${res.skipped_no_email} skipped with no valid email address.` : ''),
      );
      setTitle(''); setMessage(''); setExtraEmails([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send the announcement.');
    } finally { setSending(false); }
  }

  return (
    <div className="max-w-3xl">
      {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
      {queuedNote && <Banner kind="success" onDismiss={() => setQueuedNote(null)}>{queuedNote}</Banner>}

      {jobId && <EmailJobProgress jobId={jobId} onDismiss={() => setJobId(null)} />}
      <RecentEmailJobs kind="broadcast" onSelect={setJobId} refreshKey={jobsKey} />

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
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-2 block">Audience</label>
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 w-fit">
            {([
              { key: 'workers', label: 'Workers', icon: <Users size={12} /> },
              { key: 'custom', label: 'Typed addresses only', icon: <AtSign size={12} /> },
            ] as { key: Audience; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
              <button key={key} type="button" onClick={() => setAudience(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  audience === key ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-theme-heading'
                }`}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>

        {!customOnly && (
          <>
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
          </>
        )}

        <EmailRecipientsInput
          value={extraEmails}
          onChange={setExtraEmails}
          label={customOnly ? 'Email addresses' : 'Also send to these addresses (optional)'}
          placeholder="name@company.com"
          hint={
            customOnly
              ? 'Type an address and press Enter to add another. Paste a comma-separated list to add several at once. Only these addresses receive the email.'
              : 'Anyone here receives the same email alongside the matching workers — useful for finance, partners or an ops inbox.'
          }
        />

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-theme-muted">
            Sends run in the background, 100 recipients per call, so you can leave this page.
          </p>
          <button type="submit"
            disabled={sending || (customOnly && extraEmails.length === 0)}
            className="btn-primary text-sm py-2 px-5 flex items-center gap-2 disabled:opacity-60">
            {sending ? <SpinningDots size="sm" /> : <Megaphone size={14} />}
            {customOnly
              ? `Send to ${extraEmails.length} address${extraEmails.length === 1 ? '' : 'es'}`
              : 'Send Announcement'}
          </button>
        </div>
      </form>
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
    { key: 'broadcast', label: 'Announcements', icon: <Megaphone size={13} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Communications"
        description="Email each worker their payslip, send announcements to a group, and audit every delivery."
      />
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 w-fit">
          {TABS.map(({ key, label, icon }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === key ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-theme-heading'
              }`}>
              {icon} {label}
            </button>
          ))}
        </div>
        <Link href="/admin/payroll/receipts/history"
          className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
          <ScrollText size={13} /> Email history
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <Banner kind="error">{error}</Banner>
      ) : (
        <>
          {tab === 'payslips' && <PayslipsTab periods={periods} />}
          {tab === 'broadcast' && <BroadcastTab countries={countries} />}
        </>
      )}
    </div>
  );
}
