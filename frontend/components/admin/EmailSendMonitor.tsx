'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react';

import EmailJobProgress, { jobIsActive, type EmailJob } from '@/components/admin/EmailJobProgress';
import { subscribeEmailJobsRefresh } from '@/lib/email-jobs';
import { registerLogoutGuard } from '@/lib/logout-guard';
import { api } from '@/lib/api';

const POLL_ACTIVE_MS = 2500;
const POLL_IDLE_MS = 15000;

export default function EmailSendMonitor() {
  const [jobs, setJobs] = useState<EmailJob[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<EmailJob[]>('/communications/jobs?active=true&limit=20');
      setJobs(rows.filter(jobIsActive));
    } catch {
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeEmailJobsRefresh(() => { void load(); });
  }, [load]);

  const active = jobs.length > 0;

  useEffect(() => {
    const ms = active ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    const t = setInterval(() => { void load(); }, ms);
    return () => clearInterval(t);
  }, [active, load]);

  useEffect(() => {
    return registerLogoutGuard(() => {
      if (jobs.some(jobIsActive)) {
        return 'Payslip emails are still sending. Wait until they finish, or cancel the send, before signing out.';
      }
      return null;
    });
  }, [jobs]);

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);

  useEffect(() => {
    if (openId && !jobs.some((job) => job.job_id === openId)) {
      setOpenId(null);
    }
  }, [jobs, openId]);

  if (!active) return null;

  const primary = jobs[0];
  const done = primary.sent + primary.failed + primary.skipped;
  const label = jobs.length === 1
    ? `Sending ${done}/${primary.total}`
    : `${jobs.length} sends in progress`;

  return (
    <div className="fixed bottom-4 right-4 z-[80] flex flex-col items-end gap-2 max-w-[min(24rem,calc(100vw-2rem))]">
      {openId && (
        <div className="w-full min-w-[18rem] rounded-2xl border border-white/10 bg-brand-surface-lowest/95 backdrop-blur shadow-2xl p-1">
          <EmailJobProgress
            jobId={openId}
            onDismiss={() => setOpenId(null)}
            onFinished={() => { void load(); }}
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpenId((prev) => (prev === primary.job_id ? null : primary.job_id))}
        className="inline-flex items-center gap-2 rounded-full border border-gold-accent/40 bg-gold-accent text-brand-background px-3.5 py-2 text-xs font-bold shadow-lg hover:bg-gold-accent/90"
        title="Email send continues in the background. Open to see progress."
      >
        <Mail size={14} />
        {label}
        {openId && <X size={12} />}
      </button>
    </div>
  );
}
