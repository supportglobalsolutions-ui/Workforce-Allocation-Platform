'use client';

import Link from 'next/link';
import { CalendarX } from 'lucide-react';

interface AbsenceReportsButtonProps {
  /** Pending reports — shown as a pill so the queue's depth is visible. */
  count?: number;
  href?: string;
  label?: string;
  className?: string;
}

/**
 * The way into the absence queue, in the theme's gold.
 *
 * Absences get no sidebar item by design, so every surface that lists work
 * needs its own door to them. Gold is reserved here for exactly that: it is
 * the one control on these pages that is not part of the page's own job, so
 * it must read as the odd one out rather than blend into the table chrome.
 */
export default function AbsenceReportsButton({
  count,
  href = '/admin/notifications/absences',
  label = 'Absence reports',
  className = '',
}: AbsenceReportsButtonProps) {
  return (
    <Link
      href={href}
      title="Open the absence report queue"
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl bg-gold-accent px-3.5 py-2 text-xs font-bold text-brand-background transition-colors hover:bg-gold-accent/90 active:scale-[0.98] ${className}`}
    >
      <CalendarX size={15} />
      {label}
      {count != null && count > 0 && (
        <span className="ml-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-brand-background/20 px-1.5 py-0.5 text-[10px] font-black leading-none">
          {count}
        </span>
      )}
    </Link>
  );
}
