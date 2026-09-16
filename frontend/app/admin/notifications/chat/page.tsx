'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Archive, MessageSquare, RefreshCw, Send } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import NotificationTabs from '@/components/admin/NotificationTabs';
import { reportError } from '@/lib/errors';
import {
  ChatMessage,
  ChatThreadSummary,
  MESSAGE_MAX_CHARS,
  archiveChatThread,
  getChatThread,
  listChatThreads,
  replyToChatThread,
} from '@/lib/chat';

export default function AdminChatPage() {
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const rows = await listChatThreads(false);
      setThreads(rows);
      setError(null);
    } catch (err) {
      setError(reportError('Load chat threads', err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
    const t = setInterval(() => { void loadThreads(); }, 15_000);
    return () => clearInterval(t);
  }, [loadThreads]);

  const openThread = async (id: string) => {
    setSelectedId(id);
    setLoadingThread(true);
    setDraft('');
    try {
      const rows = await getChatThread(id);
      setMessages(rows);
      await loadThreads();
    } catch (err) {
      setError(reportError('Open chat thread', err, { threadId: id }));
    } finally {
      setLoadingThread(false);
    }
  };

  const onReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId || !draft.trim() || sending) return;
    setSending(true);
    try {
      const msg = await replyToChatThread(selectedId, draft.trim());
      setMessages((prev) => [...prev, msg]);
      setDraft('');
      await loadThreads();
    } catch (err) {
      setError(reportError('Reply to chat', err, { threadId: selectedId }));
    } finally {
      setSending(false);
    }
  };

  const selected = threads.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Worker chat"
        description="Signed-in workers message here. Public contact-form enquiries stay in the Enquiries inbox."
        actions={
          <button
            type="button"
            onClick={() => { setLoading(true); void loadThreads(); }}
            className="btn-secondary text-xs inline-flex items-center gap-1.5"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        }
      />
      <NotificationTabs />

      {error && <p className="text-danger text-sm mb-3">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 min-h-[520px]">
        <div className="glass-panel overflow-hidden flex flex-col">
          <p className="text-[11px] uppercase tracking-wide text-theme-muted px-3 py-2 border-b border-white/10">
            Conversations
          </p>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-theme-muted text-xs p-4 animate-pulse">Loading…</p>
            ) : threads.length === 0 ? (
              <p className="text-theme-muted text-xs p-4">No chats yet.</p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void openThread(t.id)}
                  className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
                    selectedId === t.id ? 'bg-white/8' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white truncate">{t.display_name}</span>
                    {t.unread_for_admin > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                        {t.unread_for_admin}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-theme-muted truncate mt-0.5">
                    {t.last_message_preview || t.email}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="glass-panel flex flex-col overflow-hidden">
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-theme-muted text-sm">
              <MessageSquare size={22} />
              Pick a conversation
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {selected?.display_name ?? 'Worker'}
                  </p>
                  <p className="text-[11px] text-theme-muted truncate">{selected?.email}</p>
                </div>
                {selectedId && (
                  <button
                    type="button"
                    className="text-xs text-theme-muted hover:text-white inline-flex items-center gap-1"
                    onClick={async () => {
                      try {
                        await archiveChatThread(selectedId, true);
                        setSelectedId(null);
                        setMessages([]);
                        await loadThreads();
                      } catch (err) {
                        setError(reportError('Archive chat', err, { threadId: selectedId }));
                      }
                    }}
                  >
                    <Archive size={12} /> Archive
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingThread ? (
                  <p className="text-theme-muted text-sm animate-pulse">Loading messages…</p>
                ) : (
                  messages.map((m) => {
                    const fromAdmin = m.sender_side === 'admin';
                    return (
                      <div
                        key={m.id}
                        className={`flex ${fromAdmin ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                            fromAdmin
                              ? 'bg-emerald-accent/20 border border-emerald-accent/30 text-white'
                              : 'bg-white/5 border border-white/10 text-theme-heading'
                          }`}
                        >
                          <p className="text-[10px] text-theme-muted mb-1">
                            {fromAdmin ? 'You' : m.sender_name}
                            {m.created_at && (
                              <span className="ml-2 opacity-70">
                                {new Date(m.created_at).toLocaleString()}
                              </span>
                            )}
                          </p>
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form onSubmit={onReply} className="border-t border-white/10 p-3 flex gap-2 items-end">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_CHARS))}
                  rows={2}
                  placeholder="Reply…"
                  className="flex-1 resize-none rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-theme-muted focus:outline-none focus:border-emerald-accent/50"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2 disabled:opacity-50"
                >
                  <Send size={14} />
                  {sending ? 'Sending…' : 'Reply'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
