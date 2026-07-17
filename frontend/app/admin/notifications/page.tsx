'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Bell, CheckCircle, Mail, Monitor, Search, Send, User, Users, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import { api } from '@/lib/api';

interface NotificationResponse {
  id: string;
  sender_name: string | null;
  title: string;
  message: string;
  category?: string;
  target_type: 'all' | 'specific';
  target_worker_id: string | null;
  target_worker_name: string | null;
  target_worker_username: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

interface NotificationRecipient {
  id: string;
  display_name: string;
  username: string | null;
  email: string | null;
}

interface SendResult {
  notifications: NotificationResponse[];
  in_app_count: number;
  emailed: number;
  skipped_no_email: number;
  email_failures: string[];
}

type Channel = 'in_app' | 'email' | 'both';
type Category = 'general' | 'payment';
type RecipientMode = 'all' | 'selected' | 'typed';

/** Full address with a dotted domain — rejects incomplete values like user@gmail */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const BLOCKED_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'test.com', 'invalid', 'localhost',
]);

function emailValidationError(value: string): string | null {
  const addr = value.trim();
  if (!addr) return null;
  if (!isValidEmail(addr)) {
    return `Invalid email "${addr}". Use a full address like name@gmail.com (don’t forget .com).`;
  }
  const domain = addr.split('@')[1]?.toLowerCase() ?? '';
  if (BLOCKED_DOMAINS.has(domain) || domain.endsWith('.example')) {
    return `Cannot send to @${domain} — Resend rejects reserved/example domains. Use a real inbox.`;
  }
  return null;
}

function SentCard({ n }: { n: NotificationResponse }) {
  return (
    <div className="glass-panel rounded-xl border border-white/5 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {n.target_type === 'all' ? (
            <Users size={14} className="text-gold-accent shrink-0" />
          ) : (
            <User size={14} className="text-emerald-accent shrink-0" />
          )}
          <span className="text-sm font-semibold text-white truncate">{n.title}</span>
        </div>
        <span className="text-[10px] text-theme-muted shrink-0 whitespace-nowrap">
          {new Date(n.created_at).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-theme-muted leading-relaxed">{n.message}</p>
      <div className="flex items-center gap-2 text-[10px] text-theme-muted flex-wrap">
        <span className={`px-2 py-0.5 rounded-full font-medium ${n.target_type === 'all' ? 'bg-gold-accent/10 text-gold-accent' : 'bg-emerald-accent/10 text-emerald-accent'}`}>
          {n.target_type === 'all' ? 'All Workers' : `@${n.target_worker_username ?? n.target_worker_name ?? 'Unknown'}`}
        </span>
        {n.category === 'payment' && (
          <span className="px-2 py-0.5 rounded-full font-medium bg-emerald-accent/10 text-emerald-accent">Payment</span>
        )}
        {n.target_type === 'specific' && n.target_worker_name && (
          <span className="text-theme-muted">{n.target_worker_name}</span>
        )}
      </div>
    </div>
  );
}

const emptyForm = {
  title: '',
  message: '',
  channels: 'in_app' as Channel,
  category: 'general' as Category,
  recipientMode: 'all' as RecipientMode,
};

export default function AdminNotificationsPage() {
  const [sent, setSent] = useState<NotificationResponse[]>([]);
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSummary, setSendSummary] = useState<string | null>(null);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recipientQuery, setRecipientQuery] = useState('');
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<NotificationResponse[]>('/notifications/sent'),
      api.get<NotificationRecipient[]>('/notifications/recipients'),
    ])
      .then(([history, people]) => {
        setSent(history);
        setRecipients(people);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredRecipients = useMemo(() => {
    const q = recipientQuery.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter((r) =>
      r.display_name.toLowerCase().includes(q)
      || (r.username ?? '').toLowerCase().includes(q)
      || (r.email ?? '').toLowerCase().includes(q),
    );
  }, [recipients, recipientQuery]);

  const selectedWithoutEmail = useMemo(() => {
    if (form.recipientMode === 'all') {
      return recipients.filter((r) => !r.email);
    }
    return recipients.filter((r) => selectedIds.has(r.id) && !r.email);
  }, [form.recipientMode, recipients, selectedIds]);

  const wantsEmail = form.channels === 'email' || form.channels === 'both';
  const wantsInApp = form.channels === 'in_app' || form.channels === 'both';

  const draftEmailError = useMemo(
    () => (emailDraft.trim() ? emailValidationError(emailDraft) : null),
    [emailDraft],
  );

  function showError(message: string) {
    setSendSummary(null);
    setSendError(message);
  }

  function toggleWorker(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addEmailTag(raw?: string) {
    const value = (raw ?? emailDraft).trim();
    if (!value) {
      const msg = 'Enter an email address first.';
      setEmailFieldError(msg);
      showError(msg);
      return false;
    }
    const err = emailValidationError(value);
    if (err) {
      setEmailFieldError(err);
      showError(err);
      return false;
    }
    const key = value.toLowerCase();
    setExtraEmails((prev) => (prev.some((e) => e.toLowerCase() === key) ? prev : [...prev, value]));
    setEmailDraft('');
    setEmailFieldError(null);
    setSendError(null);
    return true;
  }

  function removeEmailTag(email: string) {
    setExtraEmails((prev) => prev.filter((e) => e !== email));
  }

  /** Include whatever is still sitting in the input box (user often types then hits Send). */
  function emailsForSend(): string[] {
    const draft = emailDraft.trim();
    const merged = [...extraEmails];
    if (
      isValidEmail(draft)
      && !emailValidationError(draft)
      && !merged.some((e) => e.toLowerCase() === draft.toLowerCase())
    ) {
      merged.push(draft);
    }
    return merged;
  }

  const handleSend = async () => {
    setSendSummary(null);

    if (!form.title.trim() || !form.message.trim()) {
      showError('Title and message are required.');
      return;
    }

    const draft = emailDraft.trim();
    if (draft) {
      const err = emailValidationError(draft);
      if (err) {
        setEmailFieldError(err);
        showError(err);
        return;
      }
    }

    for (const email of extraEmails) {
      const err = emailValidationError(email);
      if (err) {
        setEmailFieldError(err);
        showError(err);
        return;
      }
    }

    const emails = emailsForSend();

    if (form.recipientMode === 'typed') {
      if (!wantsEmail) {
        showError('Typed-email-only delivery requires Email or Both channel.');
        return;
      }
      if (emails.length === 0) {
        const msg = 'Type a full email address (e.g. name@gmail.com) before sending.';
        setEmailFieldError(msg);
        showError(msg);
        return;
      }
    }
    if (form.recipientMode === 'selected' && selectedIds.size === 0 && emails.length === 0) {
      showError('Select workers from the list or add at least one email address.');
      return;
    }
    if (wantsInApp && form.recipientMode === 'selected' && selectedIds.size === 0) {
      showError('In-app delivery needs at least one worker selected (typed emails are email-only).');
      return;
    }
    if (wantsInApp && form.recipientMode === 'typed') {
      showError('In-app cannot go to typed emails only — switch channel to Email, or select workers.');
      return;
    }
    if (wantsEmail && form.recipientMode === 'selected' && selectedIds.size === 0 && emails.length === 0) {
      showError('Email delivery needs workers or typed email addresses.');
      return;
    }

    setSending(true);
    setSendError(null);
    setEmailFieldError(null);
    setSendSummary(null);

    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        message: form.message.trim(),
        channels: form.channels,
        category: form.category,
        target_type: form.recipientMode === 'all' ? 'all' : 'specific',
        extra_emails: emails,
      };
      if (form.recipientMode === 'selected' && selectedIds.size > 0) {
        payload.worker_ids = Array.from(selectedIds);
      }
      if (form.recipientMode === 'typed') {
        payload.worker_ids = [];
      }

      const result = await api.post<SendResult>('/notifications', payload);
      if (result.notifications.length) {
        setSent((prev) => [...result.notifications, ...prev]);
      }

      const parts = [
        result.in_app_count > 0 ? `${result.in_app_count} in-app` : null,
        result.emailed > 0 ? `${result.emailed} emailed` : null,
        result.skipped_no_email > 0 ? `${result.skipped_no_email} skipped (no email)` : null,
      ].filter(Boolean);
      let summary = parts.length ? `Sent — ${parts.join(', ')}.` : 'Request completed.';
      if (result.email_failures.length) {
        summary += ` Failures: ${result.email_failures.slice(0, 3).join('; ')}${result.email_failures.length > 3 ? '…' : ''}`;
        showError(summary);
      } else {
        setSendSummary(summary);
      }

      setForm(emptyForm);
      setSelectedIds(new Set());
      setExtraEmails([]);
      setEmailDraft('');
      setRecipientQuery('');
      setEmailFieldError(null);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to send notification.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <PageHeader
        title="Notification Center"
        description="Send in-app alerts, emails, or both — pick workers from the database or type addresses."
      />

      <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gold-accent flex items-center gap-2">
          <Send size={13} /> Compose Notification
        </h2>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Title</label>
          <input
            type="text"
            placeholder="Notification title…"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="bg-brand-surface-high border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-accent/50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Message</label>
          <textarea
            rows={4}
            placeholder="Write your message…"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            className="bg-brand-surface-high border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-accent/50 resize-none"
          />
        </div>

        {/* Channel */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Delivery channel</label>
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'in_app' as Channel, label: 'In-app', icon: Monitor },
              { key: 'email' as Channel, label: 'Email', icon: Mail },
              { key: 'both' as Channel, label: 'Both', icon: Bell },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, channels: key }))}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  form.channels === key
                    ? 'border-emerald-accent/40 bg-emerald-accent/15 text-emerald-accent'
                    : 'border-white/10 text-theme-muted hover:text-white'
                }`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Category</label>
          <div className="flex gap-2">
            {([
              { key: 'general' as Category, label: 'General' },
              { key: 'payment' as Category, label: 'Payment' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, category: key }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  form.category === key
                    ? 'border-gold-accent/40 bg-gold-accent/15 text-gold-accent'
                    : 'border-white/10 text-theme-muted hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Recipients */}
        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Recipients</label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="recipientMode"
                checked={form.recipientMode === 'all'}
                onChange={() => setForm((f) => ({ ...f, recipientMode: 'all' }))}
                className="accent-gold-400"
              />
              <span className="text-sm text-white flex items-center gap-1.5">
                <Users size={14} className="text-gold-accent" /> All workers
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="recipientMode"
                checked={form.recipientMode === 'selected'}
                onChange={() => setForm((f) => ({ ...f, recipientMode: 'selected' }))}
                className="accent-emerald-400"
              />
              <span className="text-sm text-white flex items-center gap-1.5">
                <User size={14} className="text-emerald-accent" /> Select from database
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="recipientMode"
                checked={form.recipientMode === 'typed'}
                onChange={() => {
                  setForm((f) => ({ ...f, recipientMode: 'typed', channels: f.channels === 'in_app' ? 'email' : f.channels }));
                  setSelectedIds(new Set());
                }}
                className="accent-emerald-400"
              />
              <span className="text-sm text-white flex items-center gap-1.5">
                <Mail size={14} className="text-emerald-accent" /> Typed email only (test)
              </span>
            </label>
          </div>

          {form.recipientMode === 'all' && wantsEmail && (
            <p className="text-[11px] text-amber-400/90">
              Email goes to every worker with an address — including test accounts. For a quick Resend check, choose{' '}
              <strong>Typed email only</strong>.
            </p>
          )}

          {form.recipientMode === 'selected' && (
            <div className="space-y-3 pl-2 border-l-2 border-emerald-accent/30">
              <div className="relative max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
                <input
                  type="search"
                  placeholder="Search name, username, or email…"
                  value={recipientQuery}
                  onChange={(e) => setRecipientQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-brand-surface-high border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-accent/50"
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
                {filteredRecipients.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-theme-muted">No workers match.</p>
                ) : (
                  filteredRecipients.map((r) => (
                    <label
                      key={r.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.02] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleWorker(r.id)}
                        className="accent-emerald-400"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-white truncate">{r.display_name}</span>
                        <span className="block text-[11px] text-theme-muted truncate">
                          {r.username ? `@${r.username}` : 'no username'}
                          {' · '}
                          {r.email ?? <span className="text-danger">no email</span>}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-[11px] text-theme-muted">{selectedIds.size} selected</p>
            </div>
          )}

          {/* Typed emails */}
          {(wantsEmail || form.recipientMode === 'selected' || form.recipientMode === 'typed') && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                {form.recipientMode === 'typed' ? 'Send test email to' : 'Extra email addresses (optional)'}
              </label>
              <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
                {extraEmails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-accent/15 text-emerald-accent border border-emerald-accent/30"
                  >
                    {email}
                    <button type="button" onClick={() => removeEmailTag(email)} aria-label={`Remove ${email}`}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 max-w-md">
                <input
                  type="email"
                  placeholder="name@gmail.com — type and click Send"
                  value={emailDraft}
                  onChange={(e) => {
                    setEmailDraft(e.target.value);
                    setEmailFieldError(null);
                    if (sendError) setSendError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addEmailTag();
                    }
                  }}
                  aria-invalid={Boolean(draftEmailError || emailFieldError)}
                  className={`flex-1 bg-brand-surface-high rounded-lg px-3 py-2 text-sm text-white focus:outline-none ${
                    draftEmailError || emailFieldError
                      ? 'border border-danger/60 focus:border-danger'
                      : 'border border-white/10 focus:border-emerald-accent/50'
                  }`}
                />
                <button type="button" onClick={() => addEmailTag()} className="btn-secondary text-xs px-3">
                  Add
                </button>
              </div>
              {(draftEmailError || emailFieldError) && (
                <p className="text-xs text-danger flex items-start gap-1.5">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  {emailFieldError ?? draftEmailError}
                </p>
              )}
              <p className="text-[11px] text-theme-muted">
                You can type an address and click <span className="text-theme-heading">Send</span> directly — no need to click Add first.
                Use a full address like <span className="text-theme-heading">name@gmail.com</span>.
              </p>
            </div>
          )}

          {wantsEmail && selectedWithoutEmail.length > 0 && (
            <p className="text-xs text-amber-400">
              {selectedWithoutEmail.length} selected worker{selectedWithoutEmail.length === 1 ? '' : 's'} have no linked email and will be skipped for email.
            </p>
          )}
        </div>

        {sendError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-xl border border-danger/40 bg-danger/15 text-danger text-sm"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1 leading-relaxed">{sendError}</span>
            <button
              type="button"
              onClick={() => setSendError(null)}
              className="opacity-70 hover:opacity-100"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {sendSummary && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent text-sm">
            <CheckCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1 leading-relaxed">{sendSummary}</span>
          </div>
        )}

        <button
          type="button"
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
          onClick={handleSend}
          disabled={sending || Boolean(draftEmailError)}
        >
          <Send size={15} />
          {sending ? 'Sending…' : 'Send Notification'}
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gold-accent flex items-center gap-2">
          <Bell size={13} /> Sent Notifications (in-app)
        </h2>

        {loading ? (
          <p className="text-theme-muted text-sm animate-pulse">Loading…</p>
        ) : sent.length === 0 ? (
          <div className="glass-panel rounded-xl border border-white/5 p-8 text-center text-theme-muted text-sm">
            No notifications sent yet.
          </div>
        ) : (
          <div className="space-y-3">
            {sent.map((n) => <SentCard key={n.id} n={n} />)}
          </div>
        )}
      </div>
    </div>
  );
}
