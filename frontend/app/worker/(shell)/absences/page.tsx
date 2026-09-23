'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ChevronRight } from 'lucide-react';

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
 * The worker's own absence reports.
 *
 * Deliberately not in the sidebar — that list is full. Workers arrive here
 * from My Schedule or the dashboard banner, which is where an absence is
 * actually on their mind.
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
    <div className="max-w-3xl mx-auto space-y-5 pb-10">
      <PageHeader
        title="My absence reports"
        description="Anything still pending can be corrected — open it and amend."
        actions={
          <Link
            href="/worker/my-schedule"
            className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
          >
            <ArrowLeft size={14} />
            My schedule
          </Link>
        }
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <SpinningDots size="lg" className="text-emerald-accent" />
        </div>
      ) : reports.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
          <p className="text-sm text-theme-muted">
            You have not reported any absences. You can report one from a shift on{' '}
            <Link href="/worker/my-schedule" className="font-semibold underline hover:no-underline">
              My Schedule
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
                className="glass-panel group flex items-center gap-4 rounded-2xl border border-white/5 px-4 py-4 transition-colors hover:border-amber-500/25"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
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
                    <p className="mt-1 text-[11px] font-semibold text-amber-400">
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
                <ChevronRight
                  size={16}
                  className="shrink-0 text-theme-muted group-hover:text-amber-400"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
