'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Trash2, X, XCircle } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { reportError } from '@/lib/errors';
import { reviewShiftRequest, shiftWindow, type ShiftChangeRequest } from '@/lib/shift-requests';

/** Approve or reject one worker request to change or delete an approved shift. */
export default function ShiftRequestReviewModal({
  request,
  onClose,
  onDecided,
}: {
  request: ShiftChangeRequest | null;
  onClose: () => void;
  onDecided: (updated: ShiftChangeRequest) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setNote('');
    setError(null);
  }, [request?.id]);

  if (!mounted || !request) return null;
  const isDelete = request.kind === 'delete';
  const current = shiftWindow(request.shift_start ?? request.old_start, request.shift_end ?? request.old_end);

  const decide = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !note.trim()) {
      setError('Add a note telling the worker why the request was rejected.');
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const updated = await reviewShiftRequest(request.id, { decision, admin_note: note.trim() || undefined });
      onDecided(updated);
    } catch (err) {
      setError(reportError(decision === 'approve' ? 'Approve shift request' : 'Reject shift request', err));
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shift-request-title"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="glass-modal relative z-10 w-full max-w-md rounded-2xl border border-theme p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-danger/40 bg-danger/15 text-sm font-black text-danger">
              !
            </span>
            <div className="min-w-0">
              <h2 id="shift-request-title" className="text-base font-bold text-theme-heading">
                {isDelete ? 'Delete request' : 'Change request'}
              </h2>
              <p className="text-xs text-theme-muted mt-0.5 truncate">
                {request.worker_name ?? 'Worker'} · sent {new Date(request.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} aria-label="Close" className="text-theme-muted hover:text-theme-heading disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Approved</span>
            <span className={`text-theme-heading ${isDelete ? 'line-through opacity-70' : ''}`}>{current}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted inline-flex items-center gap-1">
              <ArrowRight size={11} /> Requested
            </span>
            {isDelete ? (
              <span className="inline-flex items-center gap-1 font-semibold text-danger"><Trash2 size={13} /> Delete this shift</span>
            ) : (
              <span className="font-semibold text-amber-400">{shiftWindow(request.new_start, request.new_end)}</span>
            )}
          </div>
          {request.reason && (
            <p className="pt-1 text-xs text-theme-muted border-t border-white/[0.06]">
              <span className="font-semibold text-theme-heading">Reason:</span> {request.reason}
            </p>
          )}
        </div>

        {request.status === 'pending' ? (
          <>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">
                Note to the worker (required to reject)
              </span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className="input-field w-full resize-none" />
            </label>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void decide('reject')}
                className="text-sm py-2 px-4 inline-flex items-center gap-1.5 rounded-xl font-semibold border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {busy === 'reject' ? <SpinningDots size="sm" /> : <XCircle size={14} />}
                Reject
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void decide('approve')}
                className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy === 'approve' ? <SpinningDots size="sm" /> : <Check size={14} />}
                {isDelete ? 'Approve delete' : 'Approve new times'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-theme-muted">
            {request.status === 'cancelled' ? 'Withdrawn by the worker.' : `${request.status[0].toUpperCase()}${request.status.slice(1)}`}
            {request.reviewer_name && ` by ${request.reviewer_name}`}
            {request.reviewed_at && ` on ${new Date(request.reviewed_at).toLocaleString()}`}
            {request.admin_note && ` — “${request.admin_note}”`}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
