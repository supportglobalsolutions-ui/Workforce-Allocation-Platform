/**
 * Shift change requests — a worker asking to move or delete a shift that an
 * admin has already approved. Pending shifts are edited and deleted directly.
 */
import { api } from './api';

export type ShiftRequestKind = 'edit' | 'delete';
export type ShiftRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** The open request carried on every shift row, so lists need no extra call. */
export interface ShiftPendingRequest {
  id: string;
  kind: ShiftRequestKind;
  new_start: string | null;
  new_end: string | null;
}

export interface ShiftChangeRequest {
  id: string;
  shift_id: string;
  worker_id: string;
  kind: ShiftRequestKind;
  old_start: string;
  old_end: string;
  new_start: string | null;
  new_end: string | null;
  reason: string | null;
  status: ShiftRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
  worker_name: string | null;
  reviewer_name: string | null;
  shift_start: string | null;
  shift_end: string | null;
  shift_status: string | null;
}

export interface ShiftChangeSummary {
  pending: number;
  flagged_shift_ids: string[];
}

export interface ShiftChangeInput {
  kind: ShiftRequestKind;
  scheduled_start?: string;
  scheduled_end?: string;
  reason?: string;
}

/** "Thu, 24 Sep · 09:00–17:00". */
export function shiftWindow(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const s = new Date(start);
  const e = new Date(end);
  const day = s.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay
    ? `${day} · ${time(s)}–${time(e)}`
    : `${day} ${time(s)} – ${e.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${time(e)}`;
}

export function listShiftRequests(status?: ShiftRequestStatus): Promise<ShiftChangeRequest[]> {
  return api.get<ShiftChangeRequest[]>(`/shifts/change-requests${status ? `?status=${status}` : ''}`);
}

export function shiftRequestSummary(): Promise<ShiftChangeSummary> {
  return api.get<ShiftChangeSummary>('/shifts/change-requests/summary');
}

/** Sending again while one is open updates that request instead of adding a second. */
export function sendShiftRequest(shiftId: string, body: ShiftChangeInput): Promise<ShiftChangeRequest> {
  return api.post<ShiftChangeRequest>(`/shifts/${shiftId}/change-requests`, body);
}

export function withdrawShiftRequest(requestId: string): Promise<ShiftChangeRequest> {
  return api.delete<ShiftChangeRequest>(`/shifts/change-requests/${requestId}`);
}

export function reviewShiftRequest(
  requestId: string,
  body: { decision: 'approve' | 'reject'; admin_note?: string },
): Promise<ShiftChangeRequest> {
  return api.patch<ShiftChangeRequest>(`/shifts/change-requests/${requestId}`, body);
}

/** Pending shifts only; approved ones need a delete request. */
export function deletePendingShift<T>(shiftId: string): Promise<T> {
  return api.delete<T>(`/shifts/${shiftId}`);
}
