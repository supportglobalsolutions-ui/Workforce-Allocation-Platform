'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Pencil, PencilLine, Send, Trash2, Undo2, X } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import ConfirmModal from '@/components/platform/ConfirmModal';
import SpinningDots from '@/components/shared/SpinningDots';
import AbsenceMarker from '@/components/absence/AbsenceMarker';
import AbsenceReportModal from '@/components/absence/AbsenceReportModal';
import AbsenceReportsButton from '@/components/absence/AbsenceReportsButton';
import { api } from '@/lib/api';
import { reportError } from '@/lib/errors';
import { isOpenAbsence, listAbsenceReports, type AbsenceReport } from '@/lib/absence-reports';
import {
  deletePendingShift,
  sendShiftRequest,
  shiftWindow,
  withdrawShiftRequest,
  type ShiftPendingRequest,
} from '@/lib/shift-requests';

interface Shift {
  id: string;
  worker_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  /** "rdp_claim" = a desktop booked for these hours. */
  kind?: string;
  rdp_nickname?: string | null;
  pending_request?: ShiftPendingRequest | null;
}

function formatShiftTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** ISO timestamp → value for a `datetime-local` input, in the browser's time zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function notStarted(shift: Shift): boolean {
  return new Date(shift.scheduled_start).getTime() > Date.now();
}

/** Approved shifts change only through an admin-approved request. */
function needsRequest(shift: Shift): boolean {
  return shift.status === 'approved';
}

function canChange(shift: Shift): boolean {
  return (shift.status === 'pending' || shift.status === 'approved') && notStarted(shift);
}

function byStart(a: Shift, b: Shift): number {
  return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime();
}

function EditShiftModal({
  shift,
  onClose,
  onSaved,
  onRequested,
}: {
  shift: Shift;
  onClose: () => void;
  onSaved: (updated: Shift) => void;
  onRequested: (pending: ShiftPendingRequest) => void;
}) {
  const request = needsRequest(shift);
  const open = shift.pending_request?.kind === 'edit' ? shift.pending_request : null;
  const [start, setStart] = useState(() => toLocalInput(open?.new_start ?? shift.scheduled_start));
  const [end, setEnd] = useState(() => toLocalInput(open?.new_end ?? shift.scheduled_end));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const startAt = new Date(start);
    const endAt = new Date(end);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      setError('Enter both a start and an end time.');
      return;
    }
    if (endAt <= startAt) {
      setError('End time must be after the start time.');
      return;
    }
    if (startAt.getTime() <= Date.now()) {
      setError('The new start time must be in the future.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (request) {
        const sent = await sendShiftRequest(shift.id, {
          kind: 'edit',
          scheduled_start: startAt.toISOString(),
          scheduled_end: endAt.toISOString(),
          reason: reason.trim() || undefined,
        });
        onRequested({ id: sent.id, kind: sent.kind, new_start: sent.new_start, new_end: sent.new_end });
      } else {
        const updated = await api.patch<Shift>(`/shifts/${shift.id}`, {
          scheduled_start: startAt.toISOString(),
          scheduled_end: endAt.toISOString(),
        });
        onSaved(updated);
      }
    } catch (err) {
      setError(reportError(request ? 'Send shift change request' : 'Edit shift', err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-shift-title">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={save} className="glass-modal relative z-10 w-full max-w-sm rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="edit-shift-title" className="text-base font-bold text-theme-heading">
              {request ? 'Request a change' : 'Edit shift'}
            </h2>
            <p className="text-xs text-theme-muted mt-0.5">
              {request
                ? 'This shift is approved, so an admin has to approve the new times. Until then it keeps its current times.'
                : 'Change the times while the shift is still pending.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5">
            <X size={16} />
          </button>
        </div>
        {request && (
          <p className="text-xs text-theme-muted">
            Approved times: <span className="font-semibold text-theme-heading">{shiftWindow(shift.scheduled_start, shift.scheduled_end)}</span>
          </p>
        )}
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Start</span>
          <input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className="input-field w-full" />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">End</span>
          <input type="datetime-local" required value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="input-field w-full" />
        </label>
        {request && (
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Reason (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. I entered the wrong hours"
              className="input-field w-full resize-none"
            />
          </label>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-1.5 disabled:opacity-60">
            {request && <Send size={13} />}
            {saving ? (request ? 'Sending…' : 'Saving…') : request ? 'Send request' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RequestChip({ pending, onWithdraw, busy }: { pending: ShiftPendingRequest; onWithdraw: () => void; busy: boolean }) {
  const label = pending.kind === 'delete' ? 'Delete requested' : 'Change requested';
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400"
        title="Waiting for an admin to approve or reject"
      >
        <Clock size={11} />
        {label}
        {pending.kind === 'edit' && <span className="font-normal">· {shiftWindow(pending.new_start, pending.new_end)}</span>}
      </span>
      <button
        type="button"
        onClick={onWithdraw}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-theme-muted hover:text-theme-heading disabled:opacity-50"
      >
        <Undo2 size={11} />
        {busy ? 'Withdrawing…' : 'Withdraw'}
      </button>
    </div>
  );
}

/**
 * The shifts a worker is on for. Every row can be edited or deleted: pending
 * shifts change at once, approved ones send a request an admin approves.
 * A shift already flagged absent shows Amend rather than a second Report.
 */
export default function MyShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [reportByShift, setReportByShift] = useState<Map<string, AbsenceReport>>(new Map());
  const [absenceShift, setAbsenceShift] = useState<Shift | null>(null);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [deleteShift, setDeleteShift] = useState<Shift | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Shift[]>('/shifts?upcoming=true'),
      // Additive — a failure here must not hide the roster.
      listAbsenceReports().catch(() => [] as AbsenceReport[]),
    ])
      .then(([upcoming, mine]) => {
        setShifts(upcoming.filter((s) => s.status !== 'cancelled'));
        const map = new Map<string, AbsenceReport>();
        for (const r of mine) if (r.shift_id && isOpenAbsence(r)) map.set(r.shift_id, r);
        setReportByShift(map);
      })
      .catch((err) => setError(reportError('Load shifts', err)))
      .finally(() => setLoading(false));
  }, []);

  const setPending = (shiftId: string, pending: ShiftPendingRequest | null) =>
    setShifts((prev) => prev.map((s) => (s.id === shiftId ? { ...s, pending_request: pending } : s)));

  const confirmDelete = async () => {
    if (!deleteShift) return;
    setDeleting(true);
    setError(null);
    try {
      if (needsRequest(deleteShift)) {
        const sent = await sendShiftRequest(deleteShift.id, {
          kind: 'delete',
          reason: deleteReason.trim() || undefined,
        });
        setPending(deleteShift.id, { id: sent.id, kind: 'delete', new_start: null, new_end: null });
        setToast('Delete request sent — the shift stays on your roster until an admin approves it.');
      } else {
        await deletePendingShift(deleteShift.id);
        setShifts((prev) => prev.filter((s) => s.id !== deleteShift.id));
        setToast('Shift deleted.');
      }
      setDeleteShift(null);
      setDeleteReason('');
    } catch (err) {
      setError(reportError('Delete shift', err));
    } finally {
      setDeleting(false);
    }
  };

  const withdraw = async (shift: Shift) => {
    if (!shift.pending_request) return;
    setWithdrawingId(shift.id);
    setError(null);
    try {
      await withdrawShiftRequest(shift.pending_request.id);
      setPending(shift.id, null);
      setToast('Request withdrawn — the shift keeps its approved times.');
    } catch (err) {
      setError(reportError('Withdraw request', err));
    } finally {
      setWithdrawingId(null);
    }
  };

  const iconButton =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme text-theme-heading transition-colors disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="My shifts"
        description="Your upcoming shifts. Use the pencil to fix the hours or the bin to delete a shift. Pending shifts change straight away; approved shifts (green tick) send a request for an admin to approve."
        actions={
          <>
            <Link
              href="/worker/my-schedule"
              className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
            >
              <ArrowLeft size={14} />
              Schedule
            </Link>
            {/* Top right, level with the title — reports already sent belong
                one click away from the shifts they were filed against. */}
            <AbsenceReportsButton href="/worker/absences" label="My absences" />
          </>
        }
      />

      {error && <p className="text-sm text-danger">{error}</p>}
      {toast && <p className="text-sm text-emerald-accent">{toast}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <SpinningDots size="lg" className="text-emerald-accent" />
        </div>
      ) : shifts.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
          <p className="text-sm text-theme-muted">
            No upcoming shifts. Submit your availability on{' '}
            <Link href="/worker/my-schedule" className="font-semibold underline hover:no-underline">
              Schedule
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-white/5 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                {['Start', 'End', 'Status', 'Edit / delete', "Can't attend"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => {
                const reported = reportByShift.get(s.id);
                const pending = s.pending_request ?? null;
                const changeable = canChange(s) && !reported;
                const blockedWhy = reported
                  ? 'You reported an absence for this shift'
                  : !notStarted(s)
                    ? 'This shift has already started'
                    : 'This shift can no longer be changed';
                const approved = s.status === 'approved';
                return (
                  <tr key={s.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] align-top">
                    <td className="px-4 py-3 text-brand-on-surface">
                      {formatShiftTime(s.scheduled_start)}
                      {s.kind === 'rdp_claim' && (
                        <span className="ml-2 inline-flex items-center rounded-md border border-emerald-accent/30 bg-emerald-accent/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-accent">
                          RDP · {s.rdp_nickname ?? 'desktop'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-brand-on-surface">{formatShiftTime(s.scheduled_end)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <StatusBadge status={s.status} />
                        {approved && (
                          <CheckCircle2 size={16} className="text-emerald-500" aria-label="Approved" />
                        )}
                      </span>
                      {pending && (
                        <RequestChip pending={pending} busy={withdrawingId === s.id} onWithdraw={() => void withdraw(s)} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditShift(s)}
                          disabled={!changeable}
                          title={
                            !changeable
                              ? blockedWhy
                              : approved
                                ? pending?.kind === 'edit'
                                  ? 'Change your requested times'
                                  : 'Request new times (an admin approves)'
                                : "Change this shift's times"
                          }
                          aria-label="Edit shift"
                          className={`${iconButton} hover:border-gold-accent/40 hover:bg-white/[0.04]`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDeleteReason(''); setDeleteShift(s); }}
                          disabled={!changeable || pending?.kind === 'delete'}
                          title={
                            !changeable
                              ? blockedWhy
                              : pending?.kind === 'delete'
                                ? 'Delete already requested'
                                : approved
                                  ? 'Request to delete (an admin approves)'
                                  : 'Delete this shift'
                          }
                          aria-label="Delete shift"
                          className={`${iconButton} hover:border-danger/40 hover:bg-danger/10 hover:text-danger`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {reported ? (
                        <Link
                          href={`/worker/absences/${reported.id}`}
                          className="inline-flex items-center gap-2 group"
                          title="Open your report for this shift"
                        >
                          <AbsenceMarker title="You reported an absence for this shift" />
                          {reported.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold-accent group-hover:opacity-80">
                              <PencilLine size={12} />
                              Amend
                            </span>
                          )}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAbsenceShift(s)}
                          title="Report that you cannot attend this shift"
                          aria-label="Report that you cannot attend this shift"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger/20"
                        >
                          <AlertTriangle size={14} />
                          Report
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editShift && (
        <EditShiftModal
          shift={editShift}
          onClose={() => setEditShift(null)}
          onSaved={(updated) => {
            setShifts((prev) => prev.map((s) => (s.id === updated.id ? updated : s)).sort(byStart));
            setEditShift(null);
            setToast('Shift updated — it stays pending until an admin approves it.');
          }}
          onRequested={(pending) => {
            const amended = Boolean(editShift.pending_request);
            setPending(editShift.id, pending);
            setEditShift(null);
            setToast(
              amended
                ? 'Your open request was updated — nothing was sent twice.'
                : 'Request sent — an admin will review the new times. The shift keeps its approved times until then.',
            );
          }}
        />
      )}

      <ConfirmModal
        open={deleteShift !== null}
        title={deleteShift && needsRequest(deleteShift) ? 'Request to delete this shift?' : 'Delete this shift?'}
        tone="danger"
        icon={deleteShift && needsRequest(deleteShift) ? Send : Trash2}
        confirmLabel={deleteShift && needsRequest(deleteShift) ? 'Send request' : 'Delete'}
        busy={deleting}
        onCancel={() => setDeleteShift(null)}
        onConfirm={() => void confirmDelete()}
        body={
          deleteShift && (
            <div className="space-y-3">
              <p>
                <span className="font-semibold text-theme-heading">
                  {shiftWindow(deleteShift.scheduled_start, deleteShift.scheduled_end)}
                </span>
              </p>
              {needsRequest(deleteShift) ? (
                <>
                  <p>This shift is approved, so an admin has to approve the delete. It stays on your roster until then.</p>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Reason (optional)</span>
                    <textarea
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="e.g. I added this shift twice"
                      className="input-field w-full resize-none"
                    />
                  </label>
                </>
              ) : (
                <p>The shift is still pending, so it is removed straight away.</p>
              )}
            </div>
          )
        }
      />

      {/* Same template the dashboard uses, with this shift locked in. */}
      <AbsenceReportModal
        open={absenceShift !== null}
        lockedShift={absenceShift}
        onClose={() => setAbsenceShift(null)}
        onSubmitted={(report) => {
          const amended = report.shift_id ? reportByShift.has(report.shift_id) : false;
          if (report.shift_id) {
            setReportByShift((prev) => new Map(prev).set(report.shift_id!, report));
          }
          setAbsenceShift(null);
          setToast(
            amended
              ? 'Your existing absence report was updated — nothing was submitted twice.'
              : 'Absence reported — an admin will review it. You can amend it here until it is reviewed.',
          );
        }}
      />
    </div>
  );
}
