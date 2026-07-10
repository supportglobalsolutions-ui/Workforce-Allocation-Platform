'use client';

import { useEffect, useState } from 'react';
import { Send, Bell, Users, User, CheckCircle, Clock } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import { api } from '@/lib/api';

interface NotificationResponse {
  id: string;
  sender_name: string | null;
  title: string;
  message: string;
  target_type: 'all' | 'specific';
  target_worker_id: string | null;
  target_worker_name: string | null;
  target_worker_username: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
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
      <div className="flex items-center gap-2 text-[10px] text-theme-muted">
        <span className={`px-2 py-0.5 rounded-full font-medium ${n.target_type === 'all' ? 'bg-gold-accent/10 text-gold-accent' : 'bg-emerald-accent/10 text-emerald-accent'}`}>
          {n.target_type === 'all' ? 'All Workers' : `@${n.target_worker_username ?? n.target_worker_name ?? 'Unknown'}`}
        </span>
        {n.target_type === 'specific' && (
          <span className="text-theme-muted">{n.target_worker_name}</span>
        )}
      </div>
    </div>
  );
}

export default function AdminNotificationsPage() {
  const [sent, setSent] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  const [form, setForm] = useState({
    title: '',
    message: '',
    target_type: 'all' as 'all' | 'specific',
    target_username: '',
    target_email: '',
    lookupMode: 'username' as 'username' | 'email',
  });

  useEffect(() => {
    api.get<NotificationResponse[]>('/notifications/sent')
      .then(setSent)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      setSendError('Title and message are required.');
      return;
    }
    if (form.target_type === 'specific' && !form.target_username.trim() && !form.target_email.trim()) {
      setSendError('Provide a username or email to target a specific worker.');
      return;
    }

    setSending(true);
    setSendError(null);
    setSendSuccess(false);

    try {
      const payload: Record<string, string> = {
        title: form.title.trim(),
        message: form.message.trim(),
        target_type: form.target_type,
      };
      if (form.target_type === 'specific') {
        if (form.lookupMode === 'username') payload.target_username = form.target_username.trim();
        else payload.target_email = form.target_email.trim();
      }

      const newNotif = await api.post<NotificationResponse>('/notifications', payload);
      setSent((prev) => [newNotif, ...prev]);
      setForm({ title: '', message: '', target_type: 'all', target_username: '', target_email: '', lookupMode: 'username' });
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send notification.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <PageHeader
        title="Notification Center"
        description="Send targeted or broadcast notifications to workers."
      />

      {/* Compose */}
      <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gold-accent flex items-center gap-2">
          <Send size={13} /> Compose Notification
        </h2>

        {/* Title */}
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

        {/* Message */}
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

        {/* Target */}
        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Recipients</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="target_type"
                value="all"
                checked={form.target_type === 'all'}
                onChange={() => setForm((f) => ({ ...f, target_type: 'all' }))}
                className="accent-gold-400"
              />
              <span className="text-sm text-white flex items-center gap-1.5"><Users size={14} className="text-gold-accent" /> All Workers</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="target_type"
                value="specific"
                checked={form.target_type === 'specific'}
                onChange={() => setForm((f) => ({ ...f, target_type: 'specific' }))}
                className="accent-emerald-400"
              />
              <span className="text-sm text-white flex items-center gap-1.5"><User size={14} className="text-emerald-accent" /> Specific Worker</span>
            </label>
          </div>

          {form.target_type === 'specific' && (
            <div className="space-y-3 pl-2 border-l-2 border-emerald-accent/30">
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-theme-muted">
                  <input
                    type="radio"
                    name="lookupMode"
                    value="username"
                    checked={form.lookupMode === 'username'}
                    onChange={() => setForm((f) => ({ ...f, lookupMode: 'username' }))}
                  />
                  By Username
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-theme-muted">
                  <input
                    type="radio"
                    name="lookupMode"
                    value="email"
                    checked={form.lookupMode === 'email'}
                    onChange={() => setForm((f) => ({ ...f, lookupMode: 'email' }))}
                  />
                  By Email
                </label>
              </div>
              {form.lookupMode === 'username' ? (
                <input
                  type="text"
                  placeholder="Worker username…"
                  value={form.target_username}
                  onChange={(e) => setForm((f) => ({ ...f, target_username: e.target.value }))}
                  className="bg-brand-surface-high border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-accent/50 w-full max-w-xs"
                />
              ) : (
                <input
                  type="email"
                  placeholder="Worker email…"
                  value={form.target_email}
                  onChange={(e) => setForm((f) => ({ ...f, target_email: e.target.value }))}
                  className="bg-brand-surface-high border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-accent/50 w-full max-w-xs"
                />
              )}
            </div>
          )}
        </div>

        {sendError && <p className="text-danger text-sm">{sendError}</p>}
        {sendSuccess && (
          <p className="text-emerald-accent text-sm flex items-center gap-1.5">
            <CheckCircle size={14} /> Notification sent successfully.
          </p>
        )}

        <button
          className="btn-primary flex items-center gap-2"
          onClick={handleSend}
          disabled={sending}
        >
          <Send size={15} />
          {sending ? 'Sending…' : 'Send Notification'}
        </button>
      </div>

      {/* Sent history */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gold-accent flex items-center gap-2">
          <Bell size={13} /> Sent Notifications
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
