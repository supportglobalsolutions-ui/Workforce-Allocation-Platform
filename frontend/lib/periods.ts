export interface PeriodLike {
  id: string;
  label?: string;
  start_date: string;
  end_date: string;
  status?: string;
  is_current?: boolean;
}

function isoDay(d: string): string {
  return d.slice(0, 10);
}

export function dateToYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function coversDate(p: PeriodLike, ymd: string): boolean {
  return isoDay(p.start_date) <= ymd && ymd <= isoDay(p.end_date);
}

export function coversToday(p: PeriodLike, today = dateToYmd()): boolean {
  return coversDate(p, today);
}

/** Shared admin default: pinned current, else covering today, else latest unpaid, else first. */
export function pickCurrentPeriod<T extends PeriodLike>(list: T[], today = dateToYmd()): T | undefined {
  if (!list.length) return undefined;
  const pinned = list.find((p) => p.is_current);
  if (pinned) return pinned;
  const covering = [...list]
    .sort((a, b) => isoDay(b.start_date).localeCompare(isoDay(a.start_date)))
    .find((p) => coversDate(p, today));
  if (covering) return covering;
  const unpaid = [...list]
    .filter((p) => p.status && p.status !== 'paid')
    .sort((a, b) => isoDay(b.start_date).localeCompare(isoDay(a.start_date)))[0];
  if (unpaid) return unpaid;
  return [...list].sort((a, b) => isoDay(b.start_date).localeCompare(isoDay(a.start_date)))[0];
}

export function overlappingPeriods<T extends PeriodLike>(period: PeriodLike, all: T[]): T[] {
  const start = isoDay(period.start_date);
  const end = isoDay(period.end_date);
  return all.filter((p) => {
    if (p.id === period.id) return false;
    return isoDay(p.start_date) <= end && isoDay(p.end_date) >= start;
  });
}

const LONG_MONTHS: Record<string, string> = {
  January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr',
  May: 'May', June: 'Jun', July: 'Jul', August: 'Aug',
  September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
};

/** "March 2026" → "Mar 2026"; extra suffix kept short. */
export function shortPeriodLabel(label: string): string {
  return label.replace(
    /January|February|March|April|May|June|July|August|September|October|November|December/g,
    (m) => LONG_MONTHS[m] ?? m,
  );
}

/** Stamped period if present, else the covering unpaid/latest window for that day. */
export function periodForSessionDay<T extends PeriodLike>(
  dayIso: string,
  periods: T[],
  stampedId?: string | null,
): T | undefined {
  if (stampedId) {
    const stamped = periods.find((p) => p.id === stampedId);
    if (stamped) return stamped;
  }
  const day = isoDay(dayIso);
  return [...periods]
    .filter((p) => coversDate(p, day))
    .sort((a, b) => isoDay(b.start_date).localeCompare(isoDay(a.start_date)))[0];
}
