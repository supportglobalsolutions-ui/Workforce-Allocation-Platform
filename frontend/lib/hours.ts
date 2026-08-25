/** Pay hours: screenshot start/end only. RDP connected time is ignored. */

export function enteredPayMinutes(s: {
  image_start_at?: string | null;
  image_end_at?: string | null;
}): number {
  if (!s.image_start_at || !s.image_end_at) return 0;
  const ms = new Date(s.image_end_at).getTime() - new Date(s.image_start_at).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 60_000);
}

/** Minutes the RDP was claimed/connected (start → end, or start → now if still live). */
export function rdpConnectedMinutes(
  s: { start_time?: string | null; end_time?: string | null },
  now = Date.now(),
): number | null {
  if (!s.start_time) return null;
  const start = new Date(s.start_time).getTime();
  const end = s.end_time ? new Date(s.end_time).getTime() : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 60_000);
}

export function formatLoggedHours(minutes: number): string {
  const h = minutes / 60;
  return h.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatHoursLabel(minutes: number | null | undefined): string {
  return `${formatLoggedHours(minutes ?? 0)}h`;
}
