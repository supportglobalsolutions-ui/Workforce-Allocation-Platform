'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { LifeBuoy, Send } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import { reportError } from '@/lib/errors';
import {
  ChatMessage,
  MESSAGE_MAX_CHARS,
  getMyChat,
  sendMyChatMessage,
} from '@/lib/chat';

/** Chat with an administrator, reusable from any portal shell. */
export default function AdminChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const rows = await getMyChat();
      setMessages(rows);
      setError(null);
    } catch (err) {
      setError(reportError('Load chat', err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 12_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendMyChatMessage(text);
      setMessages((prev) => [...prev, msg]);
      setDraft('');
    } catch (err) {
      setError(reportError('Send chat message', err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full flex flex-col min-h-[70vh]">
      <PageHeader
        title="Chat with admin"
        description="Ask for help with a desktop, account, or anything else. An administrator will reply here."
      />

      {error && <p className="text-danger text-sm mb-3">{error}</p>}

      <div className="glass-panel w-full max-w-3xl self-center flex-1 flex flex-col min-h-[420px] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-theme-muted text-sm animate-pulse">Loading conversation…</p>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <LifeBuoy size={22} className="text-emerald-accent" />
              <p className="text-sm text-theme-muted">
                No messages yet. Say what went wrong and we will help.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.sender_side === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      mine
                        ? 'bg-emerald-accent/20 text-white border border-emerald-accent/30'
                        : 'bg-white/5 text-theme-heading border border-white/10'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-theme-muted mb-1">
                      {mine ? 'You' : m.sender_name || 'Admin'}
                      {m.created_at && (
                        <span className="normal-case tracking-normal ml-2 opacity-70">
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
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={onSend}
          className="border-t border-white/10 p-3 flex gap-2 items-end"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_CHARS))}
            rows={2}
            placeholder="Describe the problem…"
            className="flex-1 resize-none rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-theme-muted focus:outline-none focus:border-emerald-accent/50"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2 disabled:opacity-50"
          >
            <Send size={14} />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}
