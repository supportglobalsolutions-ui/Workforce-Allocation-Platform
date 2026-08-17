'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Ban, CheckCircle, RefreshCw, X } from 'lucide-react';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

export interface EmailJob {
  job_id: string;
  kind: string;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | string;
  subject: string;
  attach_pdf: boolean;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  error: string | null;
  errors: string[];
  created_at: string | null;
  finished_at: string | null;
}

const POLL_MS = 2000;

export function jobIsActive(job: EmailJob): boolean {
  return job.status === 'queued' || job.status === 'running';
}

/**
 * Live progress for one queued send. Polls while the job is still draining and
 * stops as soon as it settles, so a finished job costs nothing to display.
 */
export default function EmailJobProgress({
  jobId,
  onDismiss,
  onFinished,
}: {
  jobId: string;
  onDismiss?: () => void;
  onFinished?: (job: EmailJob) => void;
}) {
  const [job, setJob] = useState<EmailJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const finishedRef = useRef(false);

  const fetchJob = useCallback(async () => {
    try {
      const next = await api.get<EmailJob>(`/communications/jobs/${jobId}`);
      setJob(next);
      if (!jobIsActive(next) && !finishedRef.current) {
        finishedRef.current = true;
        onFinished?.(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read job progress.');
    }
  }, [jobId, onFinished]);

  useEffect(() => {
    finishedRef.current = false;
    void fetchJob();
  }, [fetchJob]);

  useEffect(() => {
    if (!job || !jobIsActive(job)) return;
    const t = setTimeout(() => { void fetchJob(); }, POLL_MS);
    return () => clearTimeout(t);
  }, [job, fetchJob]);

  async function act(action: 'retry' | 'cancel') {
    setBusy(true); setError(null);
    try {
      const next = await api.post<EmailJob>(`/communications/jobs/${jobId}/${action}`, {});
      finishedRef.current = false;
      setJob(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action} this job.`);
    } finally {
      setBusy(false);
    }
  }

  if (!job) {
    return (
      <div className="glass-panel rounded-xl border border-white/5 p-4 mb-4 flex items-center gap-2 text-xs text-theme-muted">
        <SpinningDots size="sm" /> Loading send progress…
      </div>
    );
  }

  const done = job.sent + job.failed + job.skipped;
  const pct = job.total > 0 ? Math.round((done / job.total) * 100) : 0;
  const active = jobIsActive(job);
  const tone = job.failed > 0 ? 'text-danger' : active ? 'text-gold-accent' : 'text-emerald-accent';

  return (
    <div className="glass-panel rounded-xl border border-white/5 p-4 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-bold flex items-center gap-2 ${tone}`}>
            {active ? <SpinningDots size="sm" /> : job.failed > 0 ? <AlertCircle size={13} /> : <CheckCircle size={13} />}
            {active
              ? `Sending — ${done} of ${job.total}`
              : job.status === 'cancelled'
                ? `Cancelled — ${job.sent} sent before stopping`
                : `Finished — ${job.sent} sent`}
          </p>
          <p className="text-[11px] text-theme-muted mt-1 truncate">{job.subject}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {job.failed > 0 && !active && (
            <button type="button" onClick={() => void act('retry')} disabled={busy}
              className="btn-secondary text-[11px] py-1.5 px-2.5 inline-flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw size={11} /> Retry {job.failed} failed
            </button>
          )}
          {active && (
            <button type="button" onClick={() => void act('cancel')} disabled={busy}
              className="btn-secondary text-[11px] py-1.5 px-2.5 inline-flex items-center gap-1.5 disabled:opacity-50">
              <Ban size={11} /> Cancel
            </button>
          )}
          {onDismiss && !active && (
            <button type="button" onClick={onDismiss} className="text-theme-muted hover:text-theme-heading">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${job.failed > 0 ? 'bg-danger' : 'bg-emerald-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-theme-muted tabular-nums">
        <span className="text-emerald-accent">{job.sent} sent</span>
        {job.failed > 0 && <span className="text-danger">{job.failed} failed</span>}
        {job.skipped > 0 && <span>{job.skipped} skipped</span>}
        {job.pending > 0 && <span>{job.pending} queued</span>}
        {job.attach_pdf && <span className="text-gold-accent">PDF attachments — one email at a time</span>}
      </div>

      {job.errors.length > 0 && (
        <p className="mt-2 text-[11px] text-danger break-words">
          {job.errors.join(' · ')}
          {job.errors.some((e) => e.includes('RESEND_API_KEY') || e.toLowerCase().includes('domain'))
            ? ' — Check RESEND_API_KEY and RESEND_FROM_EMAIL in backend/.env.'
            : ''}
        </p>
      )}
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

/** Compact history of the last few sends, so ops can reopen a job after a reload. */
export function RecentEmailJobs({
  kind,
  onSelect,
  refreshKey,
}: {
  kind?: string;
  onSelect: (jobId: string) => void;
  refreshKey?: number;
}) {
  const [jobs, setJobs] = useState<EmailJob[]>([]);

  useEffect(() => {
    const qs = new URLSearchParams({ limit: '5' });
    if (kind) qs.set('kind', kind);
    api.get<EmailJob[]>(`/communications/jobs?${qs.toString()}`)
      .then(setJobs)
      .catch(() => setJobs([]));
  }, [kind, refreshKey]);

  if (jobs.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-2">Recent sends</p>
      <div className="flex flex-wrap gap-1.5">
        {jobs.map((j) => (
          <button
            key={j.job_id}
            type="button"
            onClick={() => onSelect(j.job_id)}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-white/10 text-theme-muted hover:border-emerald-accent/30 hover:text-theme-heading transition-colors"
            title={j.created_at ? new Date(j.created_at).toLocaleString() : undefined}
          >
            {jobIsActive(j) && <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold-accent mr-1.5 align-middle" />}
            {j.sent}/{j.total} · {j.subject.slice(0, 28)}{j.subject.length > 28 ? '…' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
