/**
 * Editing one client's month on the Client ledger: the editable fields as
 * typed, a preview worked out the same way as the server, and the changed
 * fields to send.
 */
import type { ClientMonth } from '@/lib/client-billing';

export interface LedgerEdit {
  hours_from_desktops: boolean;
  billed_hours_manual: string;
  rate: string;
  actual: string;
  received_on: string;
  one_off: string;
}

export const n = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
export const money = (v: number | null) =>
  (v == null ? '—' : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const blankOr = (v: string | null) => (v == null ? '' : String(Number(v)));

export function toEdit(r: ClientMonth): LedgerEdit {
  return {
    hours_from_desktops: r.hours_from_desktops,
    billed_hours_manual: blankOr(r.billed_hours_manual),
    rate: r.rate_source === 'client' ? blankOr(r.rate) : '',
    actual: blankOr(r.actual),
    received_on: r.received_on ?? '',
    one_off: String(Number(r.one_off_costs)),
  };
}

/** What the row will show once saved, worked out the same way as the server. */
export function preview(r: ClientMonth, e: LedgerEdit) {
  const billed = e.hours_from_desktops ? n(r.desktop_hours) : e.billed_hours_manual === '' ? null : n(e.billed_hours_manual);
  const rate = r.rate_source === 'tier' ? n(r.rate) : e.rate === '' ? null : n(e.rate);
  const expected = billed != null && rate != null ? billed * rate : null;
  const actual = e.actual === '' ? null : n(e.actual);
  const billing = actual ?? expected ?? 0;
  const otherCosts = n(r.shared_costs) + n(e.one_off);
  const totalCosts = n(r.worker_cost) + n(r.transfer_cost) + otherCosts;
  return {
    billed, rate, expected, actual, billing, otherCosts, totalCosts,
    net: billing - totalCosts,
    variance: actual != null && expected != null ? actual - expected : null,
  };
}

/** The fields that differ from the saved row, in the shape the API takes. */
export function changes(r: ClientMonth, e: LedgerEdit): Record<string, unknown> {
  const o = toEdit(r);
  const out: Record<string, unknown> = {};
  if (e.hours_from_desktops !== o.hours_from_desktops) out.hours_from_desktops = e.hours_from_desktops;
  if (e.billed_hours_manual !== o.billed_hours_manual) out.billed_hours_manual = e.billed_hours_manual === '' ? null : n(e.billed_hours_manual);
  if (r.rate_source !== 'tier' && e.rate !== o.rate) out.rate = e.rate === '' ? null : n(e.rate);
  if (e.actual !== o.actual) out.actual = e.actual === '' ? null : n(e.actual);
  if (e.received_on !== o.received_on) out.received_on = e.received_on || null;
  if (n(e.one_off) !== n(o.one_off)) out.client_costs = n(e.one_off);
  return out;
}
