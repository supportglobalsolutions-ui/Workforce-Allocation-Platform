'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bell, BellOff, Camera, Check, CheckCheck, ChevronRight,
  Megaphone, User,
} from 'lucide-react';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

interface NotificationResponse {
  id: string;
  sender_name: string | null;
  title: string;
  message: string;
  target_type: 'all' | 'specific';
  target_worker_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

type Filter = 'all' | 'unread' | 'announcements';

function isEvidenceNotif(n: NotificationResponse): boolean {
  return /session evidence|session history/i.test(`${n.title} ${n.message}`);
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function NotifCard({
  n,
  onRead,
}: {
  n: NotificationResponse;
  onRead: (id: string) => void;
}) {
  const isBroadcast = n.target_type === 'all';
  const unread = !isBroadcast && !n.is_read;
  const evidence = isEvidenceNotif(n);

  const Icon = isBroadcast ? Megaphone : evidence ? Camera : User;
  const accent = isBroadcast
    ? 'border-l-gold-accent bg-gold-accent/5'
    : unread
      ? 'border-l-emerald-accent bg-emerald-accent/[0.06]'
      : 'border-l-theme bg-[var(--surface-low)]';
  const iconWrap = isBroadcast
    ? 'bg-gold-accent/15 text-gold-accent'
    : unread
      ? 'bg-emerald-accent/15 text-emerald-accent'
      : 'bg-[var(--surface-high)] text-theme-muted';

  return (
    <article
      className={`rounded-2xl border border-theme border-l-4 ${accent} p-4 sm:p-5 transition-all hover:border-emerald-accent/25`}
    >
      <div className="flex gap-3 sm:gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconWrap}`}>
          <Icon size={18} />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              {unread && (
                <span className="w-2 h-2 rounded-full bg-emerald-accent shrink-0" aria-hidden />
              )}
              <h2 className="text-sm sm:text-base font-bold text-theme-heading tracking-tight">
                {n.title}
              </h2>
              {isBroadcast && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-gold-accent/15 text-gold-accent font-bold uppercase tracking-wider">
                  Announcement
                </span>
              )}
            </div>
            <time
              dateTime={n.created_at}
              title={new Date(n.created_at).toLocaleString()}
              className="text-[11px] text-theme-muted shrink-0 tabular-nums"
            >
              {relativeTime(n.created_at)}
            </time>
          </div>

          <p className="text-sm text-theme-body leading-relaxed">{n.message}</p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-3 text-[11px] text-theme-muted">
              {n.sender_name && <span>From {n.sender_name}</span>}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {evidence && (
                <Link
                  href="/worker/session-history"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-emerald-accent/15 text-emerald-accent hover:bg-emerald-accent/25 transition-colors"
                >
                  Session history
                  <ChevronRight size={12} />
                </Link>
              )}
              {unread && (
                <button
                  type="button"
                  onClick={() => onRead(n.id)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-theme text-theme-heading hover:border-emerald-accent/40 hover:text-emerald-accent transition-colors"
                >
                  <Check size={12} />
                  Mark read
                </button>
              )}
              {!isBroadcast && n.is_read && (
                <span className="inline-flex items-center gap-1 text-[11px] text-theme-muted">
                  <CheckCheck size={12} />
                  Read
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function WorkerNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    api.get<NotificationResponse[]>('/notifications/me')
      .then(setNotifications)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load notifications'))
      .finally(() => setLoading(false));
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      const updated = await api.patch<NotificationResponse>(`/notifications/${id}/read`, {});
      setNotifications((prev) => prev.map((n) => (n.id === id ? updated : n)));
    } catch {
      // non-critical
    }
  };

  const unreadCount = notifications.filter((n) => n.target_type === 'specific' && !n.is_read).length;
  const announcementCount = notifications.filter((n) => n.target_type === 'all').length;

  const filtered = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n) => n.target_type === 'specific' && !n.is_read);
    }
    if (filter === 'announcements') {
      return notifications.filter((n) => n.target_type === 'all');
    }
    return notifications;
  }, [notifications, filter]);

  const markAllRead = async () => {
    const unread = notifications.filter((n) => n.target_type === 'specific' && !n.is_read);
    await Promise.all(unread.map((n) => handleMarkRead(n.id)));
  };

  const filters: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: notifications.length },
    { key: 'unread', label: 'Unread', count: unreadCount },
    { key: 'announcements', label: 'Announcements', count: announcementCount },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="relative overflow-hidden rounded-2xl border border-theme bg-gradient-to-br from-[#032F25] via-[#0A4D3A] to-[#032F25] px-5 py-6 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(500px_180px_at_85%_0%,rgba(212,175,55,0.2),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(420px_160px_at_10%_100%,rgba(63,199,160,0.18),transparent_55%)]" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-accent/90 mb-2">
              <Bell size={14} />
              Inbox
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Notifications
            </h1>
            <p className="text-sm text-white/65 mt-1.5 max-w-lg">
              Pay alerts, session reminders, and team announcements in one place.
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="self-start sm:self-auto inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors"
            >
              <CheckCheck size={14} />
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: notifications.length, tone: 'text-theme-heading' },
          { label: 'Unread', value: unreadCount, tone: 'text-emerald-accent' },
          { label: 'Announcements', value: announcementCount, tone: 'text-gold-accent' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-theme bg-[var(--card-bg)] px-4 py-3 text-center">
            <p className={`text-2xl font-black tracking-tight ${s.tone}`}>{s.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-theme-muted mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider border transition-colors ${
                active
                  ? 'bg-emerald-accent/15 border-emerald-accent/40 text-emerald-accent'
                  : 'border-theme text-theme-muted hover:text-theme-heading hover:border-emerald-accent/30'
              }`}
            >
              {f.label}
              <span className={`tabular-nums ${active ? 'text-emerald-accent' : 'text-theme-muted'}`}>
                {f.count ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* title lives in the banner above */}

      {loading ? (
        <div className="flex justify-center py-16">
          <SpinningDots size="lg" className="text-emerald-accent" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-danger/25 bg-danger/10 p-5">
          <p className="text-danger text-sm">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-theme bg-[var(--card-bg)] px-6 py-14 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-accent/10 text-emerald-accent flex items-center justify-center">
            <BellOff size={26} />
          </div>
          <p className="text-theme-heading font-bold">
            {filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}
          </p>
          <p className="text-theme-muted text-sm max-w-sm">
            {filter === 'unread'
              ? 'New alerts will show up here when something needs your attention.'
              : 'Pay alerts, session reminders, and announcements from your team appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <NotifCard key={n.id} n={n} onRead={handleMarkRead} />
          ))}
        </div>
      )}
    </div>
  );
}
