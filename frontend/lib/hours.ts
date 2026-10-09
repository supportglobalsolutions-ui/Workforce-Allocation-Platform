function spanMinutes(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 60_000);
}

/**
 * Pay hours: the worked blocks entered from screenshots (breaks between blocks
 * are not paid), else the single start/end pair. RDP connected time is ignored.
 */
export function enteredPayMinutes(s: {
  image_start_at?: string | null;
  image_end_at?: string | null;
  work_blocks?: { start: string; end: string }[] | null;
}): number {
  if (s.work_blocks?.length) {
    return s.work_blocks.reduce((sum, b) => sum + spanMinutes(b.start, b.end), 0);
  }
  return spanMinutes(s.image_start_at, s.image_end_at);
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

/**
 * A duration in minutes, read as hours and minutes: "12h", "2h 30m", "45m".
 *
 * Raw minute counts stop being readable past an hour or so — "720m left" is a
 * number you have to divide before it means anything.
 */
export function formatDurationShort(totalMinutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(totalMinutes ?? 0));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
