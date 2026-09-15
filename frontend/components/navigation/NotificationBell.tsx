'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Inbox, MailOpen } from 'lucide-react';

import { api } from '@/lib/api';
import { contactUnreadCount } from '@/lib/contact';
import { reportWarning } from '@/lib/errors';

interface MyNotification {
  id: string;
  title: string;
  message: string;
  category: string;
  is_read: boolean;
  created_at?: string | null;
}

interface Props {
  /** Where "View all" goes for this portal. */
  notificationsHref: string;
  /** Admins additionally see unread contact-form enquiries. */
  showEnquiries?: boolean;
}

const POLL_MS = 60_000;

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Bell that only alarms when something is actually unread.
 *
 * The previous version rendered the red dot unconditionally, so it carried no
 * information — people learn to ignore a light that is always on.
 */
export default function NotificationBell({ notificationsHref, showEnquiries = false }: Props) {
  const [unread, setUnread] = useState<MyNotification[]>([]);
  const [enquiries, setEnquiries] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const mine = await api.get<MyNotification[]>('/notifications/me');
      setUnread(mine.filter((n) => !n.is_read));
    } catch (err) {
      reportWarning('Load notifications', err);
    }
    if (showEnquiries) {
      try {
        const { unread: n } = await contactUnreadCount();
        setEnquiries(n);
      } catch {
        /* non-critical: the badge just stays as it was */
      }
    }
  }, [showEnquiries]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const total = unread.length + enquiries;

  const markRead = async (id: string) => {
    setUnread((list) => list.filter((n) => n.id !== id));
    try {
      await api.patch(`/notifications/${id}/read`, {});
    } catch (err) {
      reportWarning('Mark notification read', err, { id });
      refresh();
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-full hover:bg-white/5 transition-colors"
        aria-label={total > 0 ? `Notifications, ${total} unread` : 'Notifications, none unread'}
        aria-expanded={open}
      >
        <Bell size={18} className={total > 0 ? 'text-theme-heading' : 'text-theme-muted'} />
        {/* Only red when there is genuinely something to read. */}
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 flex items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white ring-2 ring-brand-surface-lowest">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-theme bg-brand-surface-lowest shadow-2xl z-[60] overflow-hidden">
          <div className="px-4 py-3 border-b border-theme flex items-center justify-between">
            <p className="text-sm font-bold text-theme-heading">
              {total > 0 ? `${total} unread` : 'Notifications'}
            </p>
            <Link
              href={notificationsHref}
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-emerald-accent hover:underline"
            >
              View all
            </Link>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {showEnquiries && enquiries > 0 && (
              <Link
                href="/admin/notifications/inbox"
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 px-4 py-3 border-b border-theme hover:bg-white/5 transition-colors"
              >
                <Inbox size={16} className="mt-0.5 shrink-0 text-danger" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-theme-heading">
                    {enquiries} new enquir{enquiries === 1 ? 'y' : 'ies'}
                  </span>
                  <span className="block text-xs text-theme-muted">
                    Sent from the public contact page
                  </span>
                </span>
              </Link>
            )}

            {unread.length === 0 && enquiries === 0 ? (
              <div className="px-4 py-8 text-center">
                <MailOpen size={22} className="mx-auto mb-2 text-theme-muted" />
                <p className="text-xs text-theme-muted">You are all caught up.</p>
              </div>
            ) : (
              unread.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n.id)}
                  className="w-full text-left flex items-start gap-3 px-4 py-3 border-b border-theme last:border-b-0 hover:bg-white/5 transition-colors"
                >
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-danger shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-theme-heading truncate">
                      {n.title}
                    </span>
                    <span className="block text-xs text-theme-muted line-clamp-2">{n.message}</span>
                    <span className="block text-[10px] text-theme-muted mt-1">
                      {timeAgo(n.created_at)} · click to mark read
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
