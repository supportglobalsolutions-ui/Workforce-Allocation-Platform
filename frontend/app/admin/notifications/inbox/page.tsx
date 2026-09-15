'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Mail, MailOpen, RefreshCw } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import NotificationTabs from '@/components/admin/NotificationTabs';
import { reportError } from '@/lib/errors';
import {
  ContactMessage,
  listContactMessages,
  setContactStatus,
} from '@/lib/contact';

type Filter = 'new' | 'read' | 'archived' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'new', label: 'Unread' },
  { key: 'read', label: 'Read' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

function when(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function ContactInboxPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [filter, setFilter] = useState<Filter>('new');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await listContactMessages(filter === 'all' ? undefined : filter);
      setMessages(rows);
    } catch (err) {
      setError(reportError('Load contact inbox', err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const unreadCount = useMemo(
    () => messages.filter((m) => m.status === 'new').length,
    [messages],
  );

  const changeStatus = async (m: ContactMessage, status: ContactMessage['status']) => {
    setBusyId(m.id);
    try {
      await setContactStatus(m.id, status);
      await load();
    } catch (err) {
      setError(reportError('Update enquiry status', err, { messageId: m.id }));
    } finally {
      setBusyId(null);
    }
  };

  const open = (m: ContactMessage) => {
    setOpenId((cur) => (cur === m.id ? null : m.id));
    // Opening an unread enquiry marks it read — the same gesture people
    // expect from an email client.
    if (m.status === 'new') void changeStatus(m, 'read');
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Enquiries inbox"
        description="Messages sent from the public contact page by people who are not signed in."
        actions={
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-300 border border-red-500/30">
                {unreadCount} unread
              </span>
            )}
            <button
              type="button"
              onClick={() => load()}
              className="btn-secondary text-xs py-1.5 inline-flex items-center gap-1.5"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        }
      />

      <NotificationTabs />

      {error && <p className="text-danger text-sm mb-4">{error}</p>}

      <div className="flex items-center gap-1 mb-4 bg-white/5 rounded-xl p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f.key
                ? 'bg-white/10 text-white'
                : 'text-theme-muted hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="glass-panel p-8 text-center text-theme-muted text-sm">
          {filter === 'new' ? 'No unread enquiries.' : 'Nothing here.'}
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => {
            const isOpen = openId === m.id;
            const unread = m.status === 'new';
            return (
              <div
                key={m.id}
                className={`glass-panel p-4 ${unread ? 'border-l-2 border-l-red-500' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => open(m)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-sm truncate ${unread ? 'font-bold text-white' : 'font-medium text-theme-muted'}`}>
                        {m.subject}
                      </p>
                      <p className="text-xs text-theme-muted mt-0.5 truncate">
                        {m.name} · {m.email}
                      </p>
                    </div>
                    <span className="text-[11px] text-theme-muted shrink-0">{when(m.created_at)}</span>
                  </div>
                  {!isOpen && (
                    <p className="mt-2 text-xs text-theme-muted line-clamp-1">{m.message}</p>
                  )}
                </button>

                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
                    <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{m.message}</p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`mailto:${m.email}?subject=${encodeURIComponent('Re: ' + m.subject)}`}
                        className="btn-primary text-xs py-1.5 inline-flex items-center gap-1.5"
                      >
                        <Mail size={13} /> Reply by email
                      </a>
                      {m.status !== 'new' && (
                        <button
                          type="button"
                          disabled={busyId === m.id}
                          onClick={() => changeStatus(m, 'new')}
                          className="btn-secondary text-xs py-1.5 inline-flex items-center gap-1.5"
                        >
                          <MailOpen size={13} /> Mark unread
                        </button>
                      )}
                      {m.status !== 'archived' && (
                        <button
                          type="button"
                          disabled={busyId === m.id}
                          onClick={() => changeStatus(m, 'archived')}
                          className="btn-secondary text-xs py-1.5 inline-flex items-center gap-1.5"
                        >
                          <Archive size={13} /> Archive
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
