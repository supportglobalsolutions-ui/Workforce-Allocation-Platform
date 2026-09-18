'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { reportWarning } from '@/lib/errors';

interface MyNotification {
  id: string;
  title: string;
  message: string;
  category: string;
  is_read: boolean;
  created_at?: string | null;
}

const SEEN_KEY = 'wap_notif_toast_seen';
const POLL_MS = 45_000;

function loadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-40)));
  } catch {
    /* ignore */
  }
}

/**
 * Surface unread in-app notifications as toasts (once per session per id).
 */
export default function NotificationToast({ profileHref = '/worker/profile' }: { profileHref?: string }) {
  const [toast, setToast] = useState<MyNotification | null>(null);

  const refresh = useCallback(async () => {
    try {
      const mine = await api.get<MyNotification[]>('/notifications/me');
      const unread = mine.filter((n) => !n.is_read);
      const seen = loadSeen();
      const next = unread.find((n) => !seen.has(n.id));
      if (next) {
        seen.add(next.id);
        saveSeen(seen);
        setToast(next);
      }
    } catch (err) {
      reportWarning('Notification toast', err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 12_000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const isPhone = /phone/i.test(toast.title);

  return (
    <div className="fixed bottom-4 right-4 z-[80] w-[min(380px,calc(100vw-2rem))] animate-in fade-in slide-in-from-bottom-2">
      <div className="rounded-2xl border border-emerald-accent/30 bg-brand-surface-lowest shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-theme-heading">{toast.title}</p>
            <p className="text-xs text-theme-muted mt-1 leading-relaxed">{toast.message}</p>
            {isPhone && (
              <Link
                href={profileHref}
                className="inline-block mt-2.5 text-xs font-bold uppercase tracking-wider text-emerald-accent hover:underline"
              >
                Update phone on Profile
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-theme-muted hover:text-theme-heading p-0.5"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
