'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle, Users, User } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
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

function NotifCard({
  n,
  onRead,
}: {
  n: NotificationResponse;
  onRead: (id: string) => void;
}) {
  const isBroadcast = n.target_type === 'all';

  return (
    <div
      className={`glass-panel rounded-xl border p-4 space-y-2 transition-all ${
        n.is_read || isBroadcast
          ? 'border-white/5 opacity-75'
          : 'border-emerald-accent/25 shadow-[0_0_12px_rgba(52,211,153,0.05)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {!n.is_read && !isBroadcast && (
            <span className="w-2 h-2 rounded-full bg-emerald-accent shrink-0" />
          )}
          {isBroadcast ? (
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

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {n.sender_name && (
            <span className="text-[10px] text-theme-muted">From: {n.sender_name}</span>
          )}
          {isBroadcast && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold-accent/10 text-gold-accent font-medium">
              Broadcast
            </span>
          )}
        </div>
        {!isBroadcast && !n.is_read && (
          <button
            className="text-[10px] text-emerald-accent hover:underline flex items-center gap-1"
            onClick={() => onRead(n.id)}
          >
            <CheckCircle size={11} /> Mark read
          </button>
        )}
        {!isBroadcast && n.is_read && (
          <span className="text-[10px] text-theme-muted flex items-center gap-1">
            <CheckCircle size={11} /> Read
          </span>
        )}
      </div>
    </div>
  );
}

export default function WorkerNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      // silently fail — non-critical
    }
  };

  const unreadCount = notifications.filter((n) => n.target_type === 'specific' && !n.is_read).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <PageHeader
        title="Notifications"
        description="Messages and alerts from your admin team."
        actions={
          unreadCount > 0 ? (
            <span className="px-2.5 py-1 rounded-full bg-emerald-accent/15 text-emerald-accent text-xs font-semibold">
              {unreadCount} unread
            </span>
          ) : undefined
        }
      />

      {loading ? (
        <p className="text-theme-muted text-sm animate-pulse">Loading…</p>
      ) : error ? (
        <div className="glass-panel rounded-xl border border-danger/20 p-6">
          <p className="text-danger text-sm">{error}</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-white/5 p-10 flex flex-col items-center gap-3 text-center">
          <BellOff size={32} className="text-theme-muted opacity-40" />
          <p className="text-theme-muted text-sm">No notifications yet.</p>
          <p className="text-theme-muted text-xs opacity-60">Your admin team will send messages here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <NotifCard key={n.id} n={n} onRead={handleMarkRead} />
          ))}
        </div>
      )}
    </div>
  );
}
