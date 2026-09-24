'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, PencilLine } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import SpinningDots from '@/components/shared/SpinningDots';
import AbsenceMarker from '@/components/absence/AbsenceMarker';
import AbsenceReportModal from '@/components/absence/AbsenceReportModal';
import { api } from '@/lib/api';
import { reportError } from '@/lib/errors';
import { isOpenAbsence, listAbsenceReports, type AbsenceReport } from '@/lib/absence-reports';

interface Shift {
  id: string;
  worker_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
}

function formatShiftTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Only open reports mark a shift; a withdrawn one leaves the row free again. */
function indexOpenReports(reports: AbsenceReport[]): Map<string, AbsenceReport> {
  const map = new Map<string, AbsenceReport>();
  for (const r of reports) {
    if (r.shift_id && isOpenAbsence(r)) map.set(r.shift_id, r);
  }
  return map;
}

/**
 * The shifts a worker is actually on for, and the one action that belongs on
 * them: saying they cannot make it.
 *
 * Kept off Schedule deliberately — that page is for submitting availability,
 * and a long roster underneath it buried the form. A shift already flagged
 * shows Amend rather than a second Report, so a change of mind can never
 * become a duplicate submission.
 */
export default function MyShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [reportByShift, setReportByShift] = useState<Map<string, AbsenceReport>>(new Map());
  const [absenceShift, setAbsenceShift] = useState<Shift | null>(null);
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
        setShifts(upcoming);
        setReportByShift(indexOpenReports(mine));
      })
      .catch((err) => setError(reportError('Load shifts', err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="My shifts"
        description="Your upcoming shifts. Use Report on any you cannot attend."
        actions={
          <Link
            href="/worker/my-schedule"
            className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
          >
            <ArrowLeft size={14} />
            Schedule
          </Link>
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
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                {['Start', 'End', 'Status', "Can't attend"].map((h) => (
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
                return (
                  <tr key={s.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-brand-on-surface">{formatShiftTime(s.scheduled_start)}</td>
                    <td className="px-4 py-3 text-brand-on-surface">{formatShiftTime(s.scheduled_end)}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
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
