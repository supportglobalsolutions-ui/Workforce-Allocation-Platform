'use client';

import { AlertTriangle } from 'lucide-react';

interface AbsenceMarkerProps {
  /** Shown on hover and to screen readers. */
  title?: string;
  /** Adds a count next to the icon — used on the admin queue. */
  count?: number;
  size?: number;
}

/**
 * The amber "!" that marks an absence wherever work is listed — worker
 * dashboard, schedule, admin shifts and sessions. One component so the mark
 * reads the same everywhere.
 */
export default function AbsenceMarker({
  title = 'Absence reported',
  count,
  size = 14,
}: AbsenceMarkerProps) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-400"
    >
      <AlertTriangle size={size} aria-hidden="true" />
      <span className="sr-only">{title}</span>
      {count != null && count > 0 && (
        <span aria-hidden="true" className="text-[10px] font-bold">
          {count}
        </span>
      )}
    </span>
  );
}
