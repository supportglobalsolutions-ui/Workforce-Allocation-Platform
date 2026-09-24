'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Eye } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import SpinningDots from '@/components/shared/SpinningDots';
import { reportError } from '@/lib/errors';
import {
  ABSENCE_REASON_LABELS,
  listAbsenceReports,
  type AbsenceReport,
} from '@/lib/absence-reports';

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The reports a worker has sent — and nothing else.
 *
 * Shifts live on Schedule, which is where the "cannot attend" button sits.
 * Listing them here too made this page a second, competing schedule.
 */
export default function WorkerAbsencesPage() {
  const [reports, setReports] = useState<AbsenceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAbsenceReports()
      .then(setReports)
      .catch((err) => setError(reportError('Load absence reports', err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="My absences"
        description="Reports you have sent. Anything still pending can be amended."
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <SpinningDots size="lg" className="text-emerald-accent" />
        </div>
      ) : reports.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
          <p className="text-sm text-theme-muted">
            No absence reports yet. Use the red{' '}
            <AlertTriangle size={12} className="inline align-[-1px] text-danger" /> Report
            button on a shift in{' '}
            <Link href="/worker/my-schedule" className="font-semibold underline hover:no-underline">
              Schedule
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id}>
              <Link
                href={`/worker/absences/${r.id}`}
                className="glass-panel group flex items-center gap-4 rounded-2xl border border-white/5 px-4 py-4 transition-colors hover:border-gold-accent/30"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold-accent/30 bg-gold-accent/10 text-gold-accent">
                  <AlertTriangle size={16} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {ABSENCE_REASON_LABELS[r.reason_category] ?? r.reason_category}
                    {r.shift_id ? ' · shift' : ' · date range'}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-theme-muted">
                    {when(r.absence_start)} → {when(r.absence_end)}
                  </p>
                  {r.status === 'pending' && (
                    <p className="mt-1 text-[11px] font-semibold text-gold-accent">
                      Awaiting review — you can still amend this
                    </p>
                  )}
                  {r.admin_note && r.status !== 'pending' && (
                    <p className="mt-1 line-clamp-1 text-[11px] text-theme-muted">
                      Admin note: {r.admin_note}
                    </p>
                  )}
                </div>

                <StatusBadge status={r.status} />
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-theme bg-brand-surface-low text-theme-muted transition-colors group-hover:border-gold-accent/40 group-hover:text-gold-accent"
                  title="View report"
                >
                  <Eye size={16} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
