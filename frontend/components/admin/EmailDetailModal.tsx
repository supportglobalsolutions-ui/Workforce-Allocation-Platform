'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, Ban, CheckCircle, Clock, Eye, Mail, MousePointerClick,
  RefreshCw, Send, ShieldAlert, X,
} from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

export interface EmailLogEntry {
  id: string;
  created_at: string | null;
  to_email: string;
  from_email: string | null;
  subject: string;
  template: string;
  status: 'sent' | 'failed';
  error: string | null;
  resend_id: string | null;
  last_event: string | null;
  last_event_at: string | null;
  provider_checked_at: string | null;
  events: { type: string; at: string; detail?: string; source?: string }[];
  email_job_id: string | null;
  payroll_period_id: string | null;
  period_label: string | null;
  worker_id: string | null;
  worker_name: string | null;
  worker?: {
    id: string;
    display_name: string;
    country: string;
    worker_type: string | null;
    status: string | null;
  };
  job?: {
    id: string;
    kind: string;
    status: string;
    subject: string;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    attach_pdf: boolean;
    created_at: string | null;
  };
  job_item?: {
    id: string;
    status: string;
    attempts: number;
    error: string | null;
    sent_at: string | null;
  };
}

/** Provider events, worst-to-best, each with the tone the UI should use. */
const EVENT_META: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'muted'; icon: typeof Send; blurb: string }> = {
  queued: { label: 'Queued', tone: 'muted', icon: Clock, blurb: 'Accepted by the provider and waiting to go out.' },
  scheduled: { label: 'Scheduled', tone: 'muted', icon: Clock, blurb: 'Held by the provider for a future send time.' },
  sent: { label: 'Sent', tone: 'muted', icon: Send, blurb: 'Handed to the receiving mail server. No delivery confirmation yet.' },
  delivery_delayed: { label: 'Delayed', tone: 'warn', icon: Clock, blurb: 'The receiving server deferred it. The provider keeps retrying.' },
  delivered: { label: 'Delivered', tone: 'good', icon: CheckCircle, blurb: 'Accepted by the recipient’s mail server. If they cannot see it, check Spam and Promotions.' },
  opened: { label: 'Opened', tone: 'good', icon: Eye, blurb: 'The recipient opened the email.' },
  clicked: { label: 'Clicked', tone: 'good', icon: MousePointerClick, blurb: 'The recipient clicked a link in the email.' },
  bounced: { label: 'Bounced', tone: 'bad', icon: Ban, blurb: 'Rejected by the recipient’s server. The address is likely wrong or full.' },
  complained: { label: 'Marked as spam', tone: 'bad', icon: ShieldAlert, blurb: 'The recipient reported this as spam. Stop sending to this address.' },
  failed: { label: 'Failed', tone: 'bad', icon: AlertCircle, blurb: 'The provider could not send it at all.' },
};

const TONE_CLASS = {
  good: 'bg-emerald-accent/15 text-emerald-accent border-emerald-accent/30',
  warn: 'bg-gold-accent/15 text-gold-accent border-gold-accent/30',
  bad: 'bg-danger/15 text-danger border-danger/30',
  muted: 'bg-white/5 text-theme-muted border-white/10',
};

export function eventMeta(event: string | null) {
  return EVENT_META[(event ?? '').toLowerCase()] ?? null;
}

export function DeliveryBadge({ event, size = 'sm' }: { event: string | null; size?: 'sm' | 'md' }) {
  const meta = eventMeta(event);
  if (!meta) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-white/5 text-theme-muted border-white/10">
        <Clock size={9} /> Unknown
      </span>
    );
  }
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-wider ${TONE_CLASS[meta.tone]} ${
      size === 'md' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]'
    }`}>
      <Icon size={size === 'md' ? 11 : 9} /> {meta.label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0">
      <span className="w-32 shrink-0 text-[10px] font-bold uppercase tracking-wider text-theme-muted pt-0.5">{label}</span>
      <span className="min-w-0 flex-1 text-xs text-theme-heading break-words">{children}</span>
    </div>
  );
}

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '—');

/** Eye-click detail for one email: who, what, and every provider event since. */
export default function EmailDetailModal({
  logId, onClose, onUpdated,
}: {
  logId: string;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [entry, setEntry] = useState<EmailLogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    try {
      const data = await api.get<EmailLogEntry>(`/communications/log/${logId}${refresh ? '?refresh=true' : ''}`);
      setEntry(data);
      if (refresh) onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load this email.');
    }
  }, [logId, onUpdated]);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void load(false).finally(() => setLoading(false));
    return () => { document.body.style.overflow = prev; };
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function recheck() {
    setRechecking(true);
    setError(null);
    await load(true);
    setRechecking(false);
  }

  if (!mounted) return null;

  const meta = eventMeta(entry?.last_event ?? null);
  const timeline = [...(entry?.events ?? [])].sort((a, b) => a.at.localeCompare(b.at));

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close email details"
        className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      <div className="glass-modal relative z-10 flex w-full max-w-3xl max-h-[min(85vh,44rem)] flex-col overflow-hidden rounded-2xl">
        <header className="shrink-0 border-b border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent">
                <Mail size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-base font-bold text-theme-heading truncate">{entry?.subject ?? 'Email'}</p>
                <p className="mt-0.5 text-xs text-theme-muted truncate">
                  to <span className="text-theme-heading">{entry?.to_email}</span>
                  {entry?.worker_name && <> · {entry.worker_name}</>}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DeliveryBadge event={entry?.last_event ?? null} size="md" />
                  {entry?.status === 'failed' && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-danger">
                      <AlertCircle size={11} /> Never sent
                    </span>
                  )}
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold capitalize text-theme-muted">
                    {entry?.template}
                  </span>
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-theme-muted transition-colors hover:bg-white/5 hover:text-theme-heading">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {loading ? (
            <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
          ) : !entry ? (
            <p className="text-sm text-danger">{error ?? 'Not found.'}</p>
          ) : (
            <div className="space-y-5">
              {meta && (
                <p className="text-xs text-theme-muted bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                  {meta.blurb}
                </p>
              )}
              {error && <p className="text-xs text-danger">{error}</p>}

              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1">Message</h3>
                <Row label="Sent at">{when(entry.created_at)}</Row>
                <Row label="From">{entry.from_email ?? '—'}</Row>
                <Row label="To">{entry.to_email}</Row>
                <Row label="Subject">{entry.subject}</Row>
                <Row label="Type"><span className="capitalize">{entry.template}</span></Row>
                {entry.period_label && <Row label="Work period">{entry.period_label}</Row>}
                <Row label="Accepted">
                  {entry.status === 'sent'
                    ? <span className="text-emerald-accent">Yes — the provider took the message</span>
                    : <span className="text-danger">No — never left the platform</span>}
                </Row>
                {entry.error && <Row label="Error"><span className="text-danger">{entry.error}</span></Row>}
                <Row label="Provider id">
                  {entry.resend_id
                    ? <code className="text-[11px] text-theme-muted">{entry.resend_id}</code>
                    : <span className="text-theme-muted">Not recorded — delivery state cannot be traced</span>}
                </Row>
                <Row label="Last checked">{when(entry.provider_checked_at)}</Row>
              </section>

              {entry.worker && (
                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1">Recipient</h3>
                  <Row label="Worker">{entry.worker.display_name}</Row>
                  <Row label="Country">{entry.worker.country || '—'}</Row>
                  <Row label="Type"><span className="capitalize">{(entry.worker.worker_type ?? '').replace(/_/g, ' ') || '—'}</span></Row>
                  <Row label="Account status"><span className="capitalize">{entry.worker.status ?? '—'}</span></Row>
                </section>
              )}

              {entry.job && (
                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1">Came from this send</h3>
                  <Row label="Send"><span className="capitalize">{entry.job.kind}</span> — {entry.job.subject}</Row>
                  <Row label="Started">{when(entry.job.created_at)}</Row>
                  <Row label="Outcome">
                    {entry.job.sent} sent · {entry.job.failed} failed · {entry.job.skipped} skipped
                    {' '}of {entry.job.total}
                  </Row>
                  <Row label="PDF attached">{entry.job.attach_pdf ? 'Yes' : 'No'}</Row>
                  {entry.job_item && (
                    <Row label="Attempts">
                      {entry.job_item.attempts}
                      {entry.job_item.error && <span className="text-danger"> — {entry.job_item.error}</span>}
                    </Row>
                  )}
                </section>
              )}

              <section>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Delivery timeline</h3>
                  {entry.resend_id && (
                    <button type="button" onClick={() => void recheck()} disabled={rechecking}
                      className="btn-secondary text-[11px] py-1 px-2.5 inline-flex items-center gap-1.5 disabled:opacity-50">
                      {rechecking ? <SpinningDots size="sm" /> : <RefreshCw size={11} />} Re-check
                    </button>
                  )}
                </div>
                {timeline.length === 0 ? (
                  <p className="text-xs text-theme-muted">
                    No provider events recorded yet. Use Re-check to ask the provider what happened,
                    or connect the Resend webhook so events arrive automatically.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {timeline.map((event, i) => (
                      <li key={`${event.type}-${event.at}-${i}`} className="flex items-start gap-2.5">
                        <span className="mt-1 shrink-0"><DeliveryBadge event={event.type} /></span>
                        <span className="min-w-0 flex-1 text-xs text-theme-muted">
                          {when(event.at)}
                          {event.detail && <span className="block text-theme-heading break-words">{event.detail}</span>}
                          {event.source === 'poll' && <span className="block text-[10px]">observed by polling</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
