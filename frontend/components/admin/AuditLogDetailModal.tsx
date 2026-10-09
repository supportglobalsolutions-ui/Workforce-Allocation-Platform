'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Eye, X } from 'lucide-react';

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_name?: string | null;
  action: string;
  action_label?: string | null;
  target_type: string;
  target_id: string;
  target_label?: string | null;
  summary?: string | null;
  previous_value?: unknown;
  new_value?: unknown;
  ip_address?: string | null;
  reason_note?: string | null;
  created_at: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function prettyKey(key: string): string {
  const words = key.replace(/[_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString();
    }
    return value;
  }
  if (typeof value === 'number') return value.toLocaleString();
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(', ') : '—';
  return JSON.stringify(value, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Before / after rows; a scalar on either side becomes a single "Value" row. */
function changeRows(before: unknown, after: unknown): { key: string; before: unknown; after: unknown }[] {
  if (before == null && after == null) return [];
  if (isRecord(before) || isRecord(after)) {
    const b = isRecord(before) ? before : {};
    const a = isRecord(after) ? after : {};
    const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
    return keys.map((key) => ({ key, before: b[key], after: a[key] }));
  }
  return [{ key: 'value', before, after }];
}

export function AuditLogEyeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="View details"
      aria-label="View log details"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted transition-colors hover:bg-white/5 hover:text-emerald-accent"
    >
      <Eye size={15} />
    </button>
  );
}

export default function AuditLogDetailModal({ log, onClose }: { log: AuditLogEntry; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const who = log.actor_name || (log.actor_id ? 'Unknown user' : 'System');
  const rows = changeRows(log.previous_value, log.new_value);
  const hasBefore = rows.some((r) => r.before !== undefined && r.before !== null);
  const hasAfter = rows.some((r) => r.after !== undefined && r.after !== null);

  const facts: [string, string][] = [
    ['When', new Date(log.created_at).toLocaleString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })],
    ['Who', who],
    ['Action', log.action_label || log.action],
    ['On', log.target_label || prettyKey(log.target_type)],
    ['IP address', log.ip_address || '—'],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-modal relative z-10 flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-accent">Log details</p>
            <h2 id="audit-detail-title" className="mt-1 text-base font-bold leading-snug text-theme-heading">
              {log.summary || log.action_label || log.action}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-theme-muted hover:bg-white/5 hover:text-theme-heading">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-5">
          <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2.5 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-xs font-semibold text-theme-muted">{label}</dt>
                <dd className="break-words text-theme-heading">{value}</dd>
              </div>
            ))}
          </dl>

          {log.reason_note && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Reason</p>
              <p className="whitespace-pre-wrap rounded-xl border border-theme bg-white/[0.02] p-3 text-sm text-theme-heading">{log.reason_note}</p>
            </div>
          )}

          {rows.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                {hasBefore && hasAfter ? 'What changed' : 'Details'}
              </p>
              <div className="overflow-hidden rounded-xl border border-theme">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-theme bg-white/[0.02] text-left text-[10px] uppercase tracking-wider text-theme-muted">
                      <th className="px-3 py-2 font-bold">Field</th>
                      {hasBefore && <th className="px-3 py-2 font-bold">Before</th>}
                      {hasAfter && <th className="px-3 py-2 font-bold">{hasBefore ? 'After' : 'Value'}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-b border-theme/60 align-top last:border-0">
                        <td className="px-3 py-2 font-semibold text-theme-muted">{prettyKey(r.key)}</td>
                        {hasBefore && (
                          <td className="whitespace-pre-wrap break-words px-3 py-2 text-theme-heading">{formatValue(r.before)}</td>
                        )}
                        {hasAfter && (
                          <td className="whitespace-pre-wrap break-words px-3 py-2 text-theme-heading">{formatValue(r.after)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="font-mono text-[10px] text-theme-muted">Log ID {log.id}</p>
        </div>

        <div className="flex justify-end border-t border-white/[0.06] p-4">
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
