'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AlertCircle, CheckCircle, Eye, FileText, Mail, RefreshCw, ScrollText, Send, X } from 'lucide-react';

import EmailJobProgress, { RecentEmailJobs } from '@/components/admin/EmailJobProgress';
import { isValidRecipient } from '@/components/admin/EmailRecipientsInput';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { objectUrlForFile } from '@/lib/download';
import { notifyEmailJobsChanged } from '@/lib/email-jobs';

interface PayrollSummary {
  id: string;
  worker_id: string;
  worker_display_name: string;
  worker_email: string | null;
  final_net: string | number;
  local_currency: string;
}

interface Props {
  periodId: string;
  periodLabel: string;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Banner({ kind, children, onDismiss }: {
  kind: 'success' | 'error';
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const styles = kind === 'success'
    ? 'bg-emerald-accent/10 border-emerald-accent/30 text-emerald-accent'
    : 'bg-danger/10 border-danger/30 text-danger';
  const Icon = kind === 'success' ? CheckCircle : AlertCircle;
  return (
    <div className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs ${styles}`}>
      <Icon size={13} className="shrink-0" />
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="opacity-70 hover:opacity-100">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export default function PayslipEmailPanel({ periodId, periodLabel, disabled, open, onOpenChange }: Props) {
  const [summaries, setSummaries] = useState<PayrollSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attachPdf, setAttachPdf] = useState(false);
  const [forceResend, setForceResend] = useState(false);
  const [overrideEmail, setOverrideEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [queuedNote, setQueuedNote] = useState<string | null>(null);
  const [jobsKey, setJobsKey] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !periodId || disabled) return;
    setLoading(true);
    setError(null);
    setJobId(null);
    setQueuedNote(null);
    api.get<PayrollSummary[]>(`/payroll/periods/${periodId}/summaries`)
      .then((rows) => {
        setSummaries(rows);
        setSelected(new Set(rows.map((row) => row.worker_id)));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Failed to load payslip rows.'))
      .finally(() => setLoading(false));
  }, [periodId, disabled, open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (preview) {
          URL.revokeObjectURL(preview.url);
          setPreview(null);
          return;
        }
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange, preview]);

  useEffect(() => {
    if (open) return;
    setPreview((prevPreview) => {
      if (prevPreview) URL.revokeObjectURL(prevPreview.url);
      return null;
    });
  }, [open]);

  const allSelected = summaries.length > 0 && selected.size === summaries.length;
  const override = overrideEmail.trim();
  const overrideInvalid = override.length > 0 && !isValidRecipient(override);
  const recipients = useMemo(
    () => summaries.filter((summary) => (
      selected.has(summary.worker_id) && (override.length > 0 || summary.worker_email)
    )),
    [summaries, selected, override],
  );

  async function handleSend() {
    if (selected.size === 0 || overrideInvalid) return;
    setSending(true);
    setError(null);
    setQueuedNote(null);
    try {
      const response = await api.post<{
        job_id: string;
        queued: number;
        skipped_no_email: number;
        skipped_already_sent: number;
      }>('/communications/payslips/send', {
        payroll_period_id: periodId,
        ...(allSelected ? {} : { worker_ids: Array.from(selected) }),
        attach_pdf: attachPdf,
        force_resend: forceResend,
        ...(override ? { override_email: override } : {}),
      });
      setJobId(response.job_id);
      setJobsKey((key) => key + 1);
      notifyEmailJobsChanged();
      const notes = [`Sending ${response.queued} payslip${response.queued === 1 ? '' : 's'}. You can close this window — sending continues in the background.`];
      if (response.skipped_already_sent > 0) {
        notes.push(`${response.skipped_already_sent} already emailed (select Re-send to include).`);
      }
      if (response.skipped_no_email > 0) {
        notes.push(`${response.skipped_no_email} skipped because no email is saved.`);
      }
      setQueuedNote(notes.join(' '));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to queue payslips.');
    } finally {
      setSending(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setQueuedNote(null);
    try {
      const result = await api.post<{ generated: number; reused: number; total: number }>(
        `/payroll/periods/${periodId}/payslips/generate`,
        {},
      );
      setQueuedNote(
        `Payslip PDFs ready — ${result.total} file${result.total === 1 ? '' : 's'} generated. Emailing will attach those files if you tick Attach PDF.`,
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to generate payslip PDFs.');
    } finally {
      setGenerating(false);
    }
  }

  async function handlePreview(summary: PayrollSummary) {
    setPreviewingId(summary.id);
    setError(null);
    try {
      const url = await objectUrlForFile(`/payroll/summaries/${summary.id}/payslip.pdf?inline=true`);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, name: summary.worker_display_name };
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Could not open this payslip PDF.');
    } finally {
      setPreviewingId(null);
    }
  }

  function closePreview() {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  if (!mounted || !open || disabled) return null;

  const historyHref = `/admin/payroll/receipts/history?from=finance&period=${encodeURIComponent(periodId)}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col p-2 sm:p-3 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payslip-emails-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <section className="glass-modal relative z-10 flex flex-col flex-1 min-h-0 w-full overflow-hidden rounded-xl sm:rounded-2xl shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-white/[0.06] shrink-0">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gold-accent/15 text-gold-accent shrink-0">
            <Mail size={16} />
          </span>
          <div className="min-w-0">
            <h2 id="payslip-emails-title" className="text-base font-bold text-theme-heading">Payslip emails</h2>
            <p className="text-xs text-theme-muted truncate">{periodLabel}</p>
          </div>
          <div className="flex-1" />
          {!loading && <span className="text-xs text-theme-muted tabular-nums">{summaries.length} workers</span>}
          <Link
            href={historyHref}
            className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
            title="View sent payslip email log (back returns to Finance)"
          >
            <ScrollText size={13} /> Email log
          </Link>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close payslip emails"
            title={jobId ? 'Close — sending continues in the background' : 'Close'}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5"
          >
            <X size={16} />
          </button>
        </header>

        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4 min-h-0">
          {loading ? (
            <div className="flex justify-center py-12"><SpinningDots className="text-emerald-accent" /></div>
          ) : summaries.length === 0 ? (
            <p className="text-sm text-theme-muted text-center py-10">No worker payslips are available for this month.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={attachPdf}
                    onChange={(event) => setAttachPdf(event.target.checked)}
                    className="accent-emerald-400 w-3.5 h-3.5"
                  />
                  <FileText size={12} /> Attach PDF
                </label>
                <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={forceResend}
                    onChange={(event) => setForceResend(event.target.checked)}
                    className="accent-emerald-400 w-3.5 h-3.5"
                  />
                  <RefreshCw size={12} /> Re-send already emailed
                </label>
                <label className="block w-full sm:w-72">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">
                    Redirect email (optional)
                  </span>
                  <input
                    type="email"
                    value={overrideEmail}
                    onChange={(event) => setOverrideEmail(event.target.value)}
                    placeholder="finance@company.com"
                    aria-invalid={overrideInvalid}
                    className={`input-field !py-1.5 text-sm ${overrideInvalid ? '!border-danger' : ''}`}
                  />
                  {overrideInvalid && <span className="text-[11px] text-danger mt-1 block">Enter a valid email address.</span>}
                </label>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={generating || sending}
                  title="Build PDF files for every worker in this month. Calculate also does this."
                  className="btn-secondary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-40"
                >
                  {generating ? <SpinningDots size="sm" /> : <FileText size={14} />}
                  Generate PDFs
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || recipients.length === 0 || overrideInvalid}
                  title={recipients.length === 0 ? 'Select at least one worker with an email address' : undefined}
                  className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-40"
                >
                  {sending ? <SpinningDots size="sm" /> : <Send size={14} />}
                  Email {recipients.length} worker{recipients.length === 1 ? '' : 's'}
                </button>
              </div>

              {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
              {queuedNote && <Banner kind="success" onDismiss={() => setQueuedNote(null)}>{queuedNote}</Banner>}
              {jobId && <EmailJobProgress jobId={jobId} onDismiss={() => setJobId(null)} />}
              <RecentEmailJobs kind="payslip" onSelect={setJobId} refreshKey={jobsKey} />

              <div className="overflow-x-auto rounded-xl border border-white/[0.06] flex-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                      <th className="px-3 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => setSelected(allSelected ? new Set() : new Set(summaries.map((row) => row.worker_id)))}
                          aria-label="Select all workers"
                          className="accent-emerald-400"
                        />
                      </th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Worker</th>
                      <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Email</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Net</th>
                      <th className="px-3 py-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((summary) => (
                      <tr key={summary.id} className="border-b border-white/[0.03] last:border-0">
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(summary.worker_id)}
                            onChange={() => {
                              setSelected((previous) => {
                                const next = new Set(previous);
                                if (next.has(summary.worker_id)) next.delete(summary.worker_id);
                                else next.add(summary.worker_id);
                                return next;
                              });
                            }}
                            aria-label={`Select ${summary.worker_display_name}`}
                            className="accent-emerald-400"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-medium text-theme-heading">{summary.worker_display_name}</td>
                        <td className="px-3 py-2.5 text-theme-muted">
                          {summary.worker_email ?? <span className="text-danger">No email</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-accent font-semibold">
                          {Number(summary.final_net).toFixed(2)} {summary.local_currency}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => void handlePreview(summary)}
                            disabled={previewingId === summary.id}
                            title={`View ${summary.worker_display_name}'s payslip PDF`}
                            aria-label={`View payslip for ${summary.worker_display_name}`}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5 disabled:opacity-40"
                          >
                            {previewingId === summary.id ? <SpinningDots size="sm" /> : <Eye size={14} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
      {preview && (
        <div className="absolute inset-0 z-20 flex flex-col p-3 sm:p-6">
          <button type="button" aria-label="Close preview" className="absolute inset-0 bg-black/70" onClick={closePreview} />
          <div className="relative z-10 flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden border border-white/10 bg-brand-surface-lowest shadow-2xl">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] shrink-0">
              <h3 className="text-sm font-bold text-theme-heading truncate">Payslip — {preview.name}</h3>
              <div className="flex-1" />
              <button
                type="button"
                onClick={closePreview}
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5"
                aria-label="Close payslip preview"
              >
                <X size={16} />
              </button>
            </div>
            <iframe title={`Payslip for ${preview.name}`} src={preview.url} className="flex-1 w-full bg-white" />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
