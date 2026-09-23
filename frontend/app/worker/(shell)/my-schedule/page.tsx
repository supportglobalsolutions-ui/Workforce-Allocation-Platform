'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, Calendar, CheckSquare, PencilLine, Square } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import AbsenceMarker from '@/components/absence/AbsenceMarker';
import AbsenceReportModal from '@/components/absence/AbsenceReportModal';
import { api } from '@/lib/api';
import { isOpenAbsence, listAbsenceReports, type AbsenceReport } from '@/lib/absence-reports';

interface Worker {
  id: string;
  display_name: string;
}

interface Shift {
  id: string;
  worker_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
}

const DAYS: { label: string; jsDay: number }[] = [
  { label: 'Monday', jsDay: 1 },
  { label: 'Tuesday', jsDay: 2 },
  { label: 'Wednesday', jsDay: 3 },
  { label: 'Thursday', jsDay: 4 },
  { label: 'Friday', jsDay: 5 },
  { label: 'Saturday', jsDay: 6 },
  { label: 'Sunday', jsDay: 0 },
];

function getNextWeekday(jsDay: number): string {
  const now = new Date();
  const today = now.getDay();
  let diff = jsDay - today;
  if (diff <= 0) diff += 7;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

interface DayRow {
  enabled: boolean;
  date: string;
  startTime: string;
  endTime: string;
}

/** Only open reports mark a shift; a withdrawn one leaves the row free again. */
function indexOpenReports(reports: AbsenceReport[]): Map<string, AbsenceReport> {
  const map = new Map<string, AbsenceReport>();
  for (const r of reports) {
    if (r.shift_id && isOpenAbsence(r)) map.set(r.shift_id, r);
  }
  return map;
}

function formatShiftTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MySchedulePage() {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  /** shift id → the open report covering it, so a flagged row can link to it. */
  const [reportByShift, setReportByShift] = useState<Map<string, AbsenceReport>>(new Map());
  const [absenceShift, setAbsenceShift] = useState<Shift | null>(null);
  const [days, setDays] = useState<DayRow[]>(
    DAYS.map(({ jsDay }) => ({
      enabled: false,
      date: getNextWeekday(jsDay),
      startTime: '09:00',
      endTime: '17:00',
    }))
  );

  useEffect(() => {
    Promise.all([
      api.get<Worker>('/workers/me'),
      api.get<Shift[]>('/shifts?upcoming=true'),
      // The worker's own reports — additive, never blocks the page. Fetched
      // whole rather than as a summary because each flagged row links to its
      // report so the worker can amend it instead of filing a second one.
      listAbsenceReports().catch(() => [] as AbsenceReport[]),
    ])
      .then(([w, s, reports]) => {
        setWorker(w);
        setShifts(s);
        setReportByShift(indexOpenReports(reports));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const updateDay = (i: number, field: keyof DayRow, value: string | boolean) => {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, [field]: value } : d)));
  };

  const handleSubmit = async () => {
    if (!worker) return;
    const enabled = days.filter((d) => d.enabled);
    if (enabled.length === 0) { setError('Select at least one day.'); return; }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      for (let i = 0; i < days.length; i++) {
        const d = days[i];
        if (!d.enabled) continue;
        const start = new Date(`${d.date}T${d.startTime}:00`);
        const end = new Date(`${d.date}T${d.endTime}:00`);
        if (end <= start) throw new Error(`End time must be after start time on ${d.date}`);
        await api.post<Shift>('/shifts', {
          worker_id: worker.id,
          scheduled_start: start.toISOString(),
          scheduled_end: end.toISOString(),
          status: 'pending',
        });
      }
      const updated = await api.get<Shift[]>('/shifts?upcoming=true');
      setShifts(updated);
      setDays((prev) => prev.map((d) => ({ ...d, enabled: false })));
      setSuccess(`${enabled.length} shift${enabled.length > 1 ? 's' : ''} submitted for admin review.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <PageHeader
        title="My Schedule"
      />

      {loading ? (
        <p className="text-theme-muted text-sm animate-pulse">Loading...</p>
      ) : (
        <>
          {/* Day selector */}
          <section className="glass-panel rounded-2xl border border-white/5 p-6">
            <h2 className="text-sm font-bold text-theme-heading mb-5">Select available days</h2>
            <div className="space-y-3">
              {DAYS.map(({ label }, i) => (
                <div
                  key={label}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    days[i].enabled
                      ? 'border-emerald-accent/30 bg-emerald-accent/[0.04]'
                      : 'border-white/[0.06] bg-white/[0.02]'
                  }`}
                >
                  <button
                    type="button"
                    className="flex items-center gap-3 min-w-[130px]"
                    onClick={() => updateDay(i, 'enabled', !days[i].enabled)}
                  >
                    {days[i].enabled
                      ? <CheckSquare size={18} className="text-emerald-accent shrink-0" />
                      : <Square size={18} className="text-theme-muted shrink-0" />
                    }
                    <span className={`text-sm font-semibold ${days[i].enabled ? 'text-white' : 'text-theme-muted'}`}>
                      {label}
                    </span>
                  </button>

                  {days[i].enabled && (
                    <div className="flex flex-wrap items-center gap-3 ml-auto">
                      <label className="flex items-center gap-2 text-xs text-theme-muted">
                        <Calendar size={13} />
                        <input
                          type="date"
                          value={days[i].date}
                          onChange={(e) => updateDay(i, 'date', e.target.value)}
                          className="bg-brand-surface-high border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-accent/50"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-theme-muted">
                        From
                        <input
                          type="time"
                          value={days[i].startTime}
                          onChange={(e) => updateDay(i, 'startTime', e.target.value)}
                          className="bg-brand-surface-high border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-accent/50"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-theme-muted">
                        To
                        <input
                          type="time"
                          value={days[i].endTime}
                          onChange={(e) => updateDay(i, 'endTime', e.target.value)}
                          className="bg-brand-surface-high border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-accent/50"
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}
            {success && <p className="mt-4 text-sm text-emerald-accent">{success}</p>}

            <div className="mt-6 flex justify-end">
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={submitting || !days.some((d) => d.enabled)}
              >
                {submitting ? 'Submitting…' : 'Submit Schedule'}
              </button>
            </div>
          </section>

          {/* Upcoming shifts */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-theme-muted">
                Upcoming shifts
              </h2>
              {/* The absence surface lives off the schedule, not in the sidebar. */}
              <Link
                href="/worker/absences"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 transition-colors hover:text-amber-300"
              >
                <AlertTriangle size={12} />
                My absence reports
              </Link>
            </div>
            {shifts.length === 0 ? (
              <div className="glass-panel rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
                <p className="text-sm text-theme-muted">No upcoming shifts scheduled.</p>
              </div>
            ) : (
              <div className="glass-panel rounded-2xl border border-white/5 overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      {['Start', 'End', 'Status', 'Absence'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant">{h}</th>
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
                              /* Already reported — the row leads to the report
                                 itself, so a second thought becomes an amend
                                 rather than a second submission. */
                              <Link
                                href={`/worker/absences/${reported.id}`}
                                className="inline-flex items-center gap-2 group"
                                title="Open your report for this shift"
                              >
                                <AbsenceMarker title="You reported an absence for this shift" />
                                {reported.status === 'pending' && (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 group-hover:text-amber-300">
                                    <PencilLine size={12} />
                                    Amend
                                  </span>
                                )}
                              </Link>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setAbsenceShift(s)}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                              >
                                <AlertTriangle size={13} />
                                Can&apos;t attend
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
          </section>
        </>
      )}

      {/* Same template as the dashboard, with this shift locked in. */}
      <AbsenceReportModal
        open={absenceShift !== null}
        lockedShift={absenceShift}
        onClose={() => setAbsenceShift(null)}
        onSubmitted={(report) => {
          // If the shift was already flagged, the form caught a duplicate and
          // amended the existing report instead — say so rather than claiming
          // a new one was filed.
          const amended = report.shift_id ? reportByShift.has(report.shift_id) : false;
          if (report.shift_id) {
            setReportByShift((prev) => new Map(prev).set(report.shift_id!, report));
          }
          setAbsenceShift(null);
          setSuccess(
            amended
              ? 'Your existing absence report was updated — nothing was submitted twice.'
              : 'Absence reported — an admin will review it. You can amend it from this list until it is reviewed.',
          );
        }}
      />
    </div>
  );
}
