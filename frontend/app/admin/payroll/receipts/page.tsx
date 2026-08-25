'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  AlertCircle, Check, CheckCircle, Mail, Megaphone, ScrollText, Search, Send, Users, X,
} from 'lucide-react';
import SpinningDots from '@/components/shared/SpinningDots';
import EmailJobProgress from '@/components/admin/EmailJobProgress';
import ConfirmModal from '@/components/platform/ConfirmModal';
import { isValidRecipient } from '@/components/admin/EmailRecipientsInput';
import { api } from '@/lib/api';
import { notifyEmailJobsChanged } from '@/lib/email-jobs';

interface WorkerRow {
  id: string;
  display_name: string;
  email: string | null;
  country: string;
  status: string;
  worker_type?: string | null;
}

function Banner({ kind, children, onDismiss }: { kind: 'success' | 'error'; children: React.ReactNode; onDismiss?: () => void }) {
  const styles = kind === 'success'
    ? 'bg-emerald-accent/10 border-emerald-accent/30 text-emerald-accent'
    : 'bg-danger/10 border-danger/30 text-danger';
  const Icon = kind === 'success' ? CheckCircle : AlertCircle;
  return (
    <div className={`flex items-center gap-2 p-3 rounded-xl border text-xs ${styles}`}>
      <Icon size={14} className="shrink-0" />
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-theme-muted hover:text-theme-heading"><X size={12} /></button>
      )}
    </div>
  );
}

function RecipientPickerModal({
  workers,
  selectedIds,
  customEmails,
  onClose,
  onApply,
}: {
  workers: WorkerRow[];
  selectedIds: Set<string>;
  customEmails: string[];
  onClose: () => void;
  onApply: (ids: Set<string>, customs: string[]) => void;
}) {
  const [ids, setIds] = useState(() => new Set(selectedIds));
  const [customs, setCustoms] = useState<string[]>(customEmails);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const countries = useMemo(
    () => [...new Set(workers.map((w) => w.country).filter(Boolean))].sort(),
    [workers],
  );

  const withEmail = useMemo(
    () => workers.filter((w) => w.email && isValidRecipient(w.email)),
    [workers],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withEmail.filter((w) => {
      if (country && w.country !== country) return false;
      if (!q) return true;
      return (
        w.display_name.toLowerCase().includes(q)
        || (w.email ?? '').toLowerCase().includes(q)
        || w.country.toLowerCase().includes(q)
      );
    });
  }, [withEmail, query, country]);

  const allVisibleSelected = visible.length > 0 && visible.every((w) => ids.has(w.id));

  function toggle(id: string) {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((w) => next.delete(w.id));
      else visible.forEach((w) => next.add(w.id));
      return next;
    });
  }

  function addCustom() {
    const addr = draft.trim();
    if (!addr) return;
    if (!isValidRecipient(addr)) {
      setDraftError('Enter a full address like name@gmail.com');
      return;
    }
    const key = addr.toLowerCase();
    if (customs.some((c) => c.toLowerCase() === key)) {
      setDraft('');
      setDraftError(null);
      return;
    }
    setCustoms((prev) => [...prev, addr]);
    setDraft('');
    setDraftError(null);
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-modal relative z-10 flex flex-col w-full max-w-lg max-h-[min(88vh,36rem)] overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-theme shrink-0">
          <div>
            <h2 className="text-sm font-bold text-theme-heading">Recipients</h2>
            <p className="text-[11px] text-theme-muted mt-0.5">
              {ids.size} selected · {customs.length} custom
            </p>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-theme shrink-0 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="input-field !pl-9 !py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCountry('')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                country === ''
                  ? 'border-emerald-accent/40 bg-emerald-accent/15 text-emerald-accent'
                  : 'border-theme text-theme-muted hover:text-theme-heading'
              }`}
            >
              All countries
            </button>
            {countries.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCountry(c === country ? '' : c)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  country === c
                    ? 'border-emerald-accent/40 bg-emerald-accent/15 text-emerald-accent'
                    : 'border-theme text-theme-muted hover:text-theme-heading'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="sticky top-0 z-10 px-4 py-2 bg-theme-card border-b border-theme flex items-center gap-2">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              className="accent-emerald-accent"
              aria-label="Select all visible"
            />
            <span className="text-[11px] text-theme-muted">{visible.length} with email</span>
          </div>
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-theme-muted">No matches</p>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {visible.map((w) => (
                <li key={w.id}>
                  <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/[0.02]">
                    <input
                      type="checkbox"
                      checked={ids.has(w.id)}
                      onChange={() => toggle(w.id)}
                      className="accent-emerald-accent shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-theme-heading truncate">{w.display_name}</span>
                      <span className="block text-[11px] text-theme-muted truncate">{w.email} · {w.country}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 border-t border-theme shrink-0 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Custom email</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setDraftError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              placeholder="name@company.com"
              className="input-field !py-2 text-sm flex-1"
            />
            <button type="button" onClick={addCustom} className="btn-secondary text-sm py-2 px-3 shrink-0">Add</button>
          </div>
          {draftError && <p className="text-[11px] text-danger">{draftError}</p>}
          {customs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {customs.map((email) => (
                <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold-accent/15 text-gold-accent border border-gold-accent/30">
                  {email}
                  <button type="button" aria-label={`Remove ${email}`} onClick={() => setCustoms((prev) => prev.filter((c) => c !== email))}>
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-theme shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          <button
            type="button"
            onClick={() => onApply(ids, customs)}
            className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-1.5"
          >
            <Check size={14} /> Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function CommunicationsPage() {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customEmails, setCustomEmails] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    api.get<WorkerRow[]>('/workers')
      .then(setWorkers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load accounts.'))
      .finally(() => setLoading(false));
  }, []);

  const selectedWorkers = useMemo(
    () => workers.filter((w) => selectedIds.has(w.id) && w.email),
    [workers, selectedIds],
  );

  const recipientCount = selectedWorkers.length + customEmails.length;

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (recipientCount === 0) {
      setError('Choose at least one recipient.');
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmSend() {
    const emails = [
      ...selectedWorkers.map((w) => w.email!).filter(Boolean),
      ...customEmails,
    ];
    const unique = [...new Map(emails.map((a) => [a.toLowerCase(), a])).values()];

    setSending(true);
    setError(null);
    setNote(null);
    try {
      const res = await api.post<{ job_id: string; queued: number; skipped_no_email: number }>('/communications/broadcast', {
        title: title.trim(),
        message: message.trim(),
        skip_workers: true,
        extra_emails: unique,
      });
      setJobId(res.job_id);
      notifyEmailJobsChanged();
      setNote(`Sending ${res.queued}`);
      setTitle('');
      setMessage('');
      setSelectedIds(new Set());
      setCustomEmails([]);
      setConfirmOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Send failed.');
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex flex-col">
      <div className="flex items-center justify-between gap-4 mb-10">
        <h1 className="text-2xl md:text-3xl font-black text-theme-heading tracking-tight">Send email</h1>
        <Link
          href="/admin/payroll/receipts/history?from=comms"
          className="btn-secondary text-sm py-2 px-3.5 inline-flex items-center gap-1.5"
        >
          <ScrollText size={14} /> History
        </Link>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center py-24">
          <SpinningDots size="lg" className="text-emerald-accent" />
        </div>
      ) : (
        <div className="flex-1 flex items-start justify-center px-2">
          <form onSubmit={handleSend} className="w-full max-w-md space-y-4">
            {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
            {note && <Banner kind="success" onDismiss={() => setNote(null)}>{note}</Banner>}
            {jobId && <EmailJobProgress jobId={jobId} onDismiss={() => setJobId(null)} />}

            <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-5 border border-theme">
              <div className="text-center">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-accent/15 text-emerald-accent mb-3">
                  <Megaphone size={20} />
                </span>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Subject</label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Subject"
                  className="input-field"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Message</label>
                <textarea
                  required
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your message…"
                  className="input-field resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">To</label>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="w-full input-field !py-3 flex items-center gap-3 text-left hover:border-emerald-accent/30 transition-colors"
                >
                  <Users size={16} className="text-emerald-accent shrink-0" />
                  <span className="flex-1 min-w-0">
                    {recipientCount === 0 ? (
                      <span className="text-theme-muted text-sm">Choose recipients…</span>
                    ) : (
                      <span className="text-sm text-theme-heading font-medium">
                        {recipientCount} recipient{recipientCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                  <Mail size={14} className="text-theme-muted shrink-0" />
                </button>
                {recipientCount > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedWorkers.slice(0, 6).map((w) => (
                      <span key={w.id} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-accent/15 text-emerald-accent border border-emerald-accent/25 truncate max-w-[10rem]">
                        {w.display_name}
                      </span>
                    ))}
                    {customEmails.slice(0, 4).map((email) => (
                      <span key={email} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold-accent/15 text-gold-accent border border-gold-accent/25 truncate max-w-[10rem]">
                        {email}
                      </span>
                    ))}
                    {recipientCount > 10 && (
                      <span className="px-2 py-0.5 text-[10px] text-theme-muted">+{recipientCount - 10}</span>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={sending || recipientCount === 0}
                className="btn-primary w-full text-sm py-3 flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {sending ? <SpinningDots size="sm" /> : <Megaphone size={15} />}
                Send
              </button>
            </div>
          </form>
        </div>
      )}

      {pickerOpen && (
        <RecipientPickerModal
          workers={workers}
          selectedIds={selectedIds}
          customEmails={customEmails}
          onClose={() => setPickerOpen(false)}
          onApply={(ids, customs) => {
            setSelectedIds(ids);
            setCustomEmails(customs);
            setPickerOpen(false);
          }}
        />
      )}
      <ConfirmModal
        open={confirmOpen}
        title="Send this email?"
        body={
          <>
            Send “{title.trim() || 'this message'}” to{' '}
            <span className="text-theme-heading font-semibold">
              {recipientCount} recipient{recipientCount === 1 ? '' : 's'}
            </span>
            ? This cannot be undone once the queue starts.
          </>
        }
        confirmLabel="Send"
        tone="gold"
        icon={Send}
        busy={sending}
        onCancel={() => { if (!sending) setConfirmOpen(false); }}
        onConfirm={() => void confirmSend()}
      />
    </div>
  );
}
