'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CalendarClock, Calendar, CheckSquare, Monitor, Square } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import { api } from '@/lib/api';
import { listRdpResources, type RdpResource } from '@/lib/rdp';

/** Normal shift, or an RDP claim shift booked on one machine. */
type ShiftKind = 'shift' | 'rdp_claim';

interface Worker {
  id: string;
  display_name: string;
}

interface Shift {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
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
  /** RDP claim shifts only: the machine booked for that day. */
  rdpId: string;
}

export default function SchedulePage() {
  const [kind, setKind] = useState<ShiftKind>('shift');
  const [rdps, setRdps] = useState<RdpResource[]>([]);
  const [worker, setWorker] = useState<Worker | null>(null);
  /** Only used to tell a repeat submission from a new one. */
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [days, setDays] = useState<DayRow[]>(
    DAYS.map(({ jsDay }) => ({
      enabled: false,
      date: getNextWeekday(jsDay),
      startTime: '09:00',
      endTime: '17:00',
      rdpId: '',
    })),
  );

  const loadShifts = () =>
    api.get<Shift[]>('/shifts?upcoming=true').then(setShifts);

  useEffect(() => {
    Promise.all([
      api.get<Worker>('/workers/me').then(setWorker),
      loadShifts(),
      // Only machines an admin has offered to this worker are listed.
      listRdpResources().then(setRdps).catch(() => setRdps([])),
    ])
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateDay = (i: number, field: keyof DayRow, value: string | boolean) => {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, [field]: value } : d)));
  };

  const handleSubmit = async () => {
    if (!worker) return;
    const enabled = days.filter((d) => d.enabled);
    if (enabled.length === 0) {
      setError('Select at least one day.');
      return;
    }
    if (kind === 'rdp_claim' && enabled.some((d) => !d.rdpId)) {
      setError('Choose an RDP for every selected day.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const already = new Set(
        shifts.map((s) => `${s.scheduled_start}|${s.scheduled_end}`),
      );
      let created = 0;
      let repeated = 0;

      for (let i = 0; i < days.length; i++) {
        const d = days[i];
        if (!d.enabled) continue;
        const start = new Date(`${d.date}T${d.startTime}:00`);
        const end = new Date(`${d.date}T${d.endTime}:00`);
        if (end <= start) throw new Error(`End time must be after start time on ${d.date}`);
        if (already.has(`${start.toISOString()}|${end.toISOString()}`)) {
          repeated += 1;
          continue;
        }
        try {
          await api.post('/shifts', {
            worker_id: worker.id,
            scheduled_start: start.toISOString(),
            scheduled_end: end.toISOString(),
            status: 'pending',
            kind,
            ...(kind === 'rdp_claim' ? { rdp_resource_id: d.rdpId } : {}),
          });
        } catch (e) {
          // Name the day so a clash ("already booked…") is easy to fix.
          throw new Error(`${DAYS[i].label} ${d.date}: ${e instanceof Error ? e.message : 'could not be submitted'}`);
        }
        created += 1;
      }

      setDays((prev) => prev.map((row) => ({ ...row, enabled: false })));
      await loadShifts();
      setSuccess(
        [
          created > 0
            ? `${created} ${kind === 'rdp_claim' ? 'RDP claim shift' : 'shift'}${created > 1 ? 's' : ''} submitted for admin review.`
            : 'Nothing new to submit.',
          repeated > 0
            ? `${repeated} ${repeated > 1 ? 'were' : 'was'} already on your schedule.`
            : '',
          kind === 'rdp_claim' ? 'See them under Claim shifts or My shifts.' : 'See them all under My shifts.',
        ]
          .filter(Boolean)
          .join(' '),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8 pb-10 text-left">
      <PageHeader
        title="My Schedule"
        description="Pick the days and hours you can work. Your shifts, absences and desktop claim slots each live on their own page."
        besideTitle={
          <Link
            href="/worker/rdp-claim-board"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-theme-heading hover:border-emerald-accent/40 hover:text-emerald-accent transition-colors"
          >
            <Monitor size={13} />
            Claim board
          </Link>
        }
        actions={
          <>
            <Link
              href="/worker/my-shifts"
              title="See the shifts you are on for"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gold-accent px-3.5 py-2 text-xs font-bold text-brand-background transition-colors hover:bg-gold-accent/90 active:scale-[0.98]"
            >
              <CalendarClock size={15} />
              My shifts
            </Link>
            <Link
              href="/worker/claim-schedules"
              title="Your RDP claim shifts"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gold-accent px-3.5 py-2 text-xs font-bold text-brand-background transition-colors hover:bg-gold-accent/90 active:scale-[0.98]"
            >
              <Monitor size={15} />
              Claim shifts
            </Link>
          </>
        }
      />

      {loading ? (
        <p className="text-theme-muted text-sm animate-pulse">Loading...</p>
      ) : (
        <>
          <section className="glass-panel rounded-2xl border border-white/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h2 className="text-sm font-bold text-theme-heading">Select available days</h2>
              <div role="radiogroup" aria-label="Shift type" className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {([
                  ['shift', 'Normal shift'],
                  ['rdp_claim', 'RDP claim shift'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={kind === value}
                    onClick={() => { setKind(value); setError(null); setSuccess(null); }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      kind === value ? 'bg-emerald-accent/20 text-emerald-accent' : 'text-theme-muted hover:text-theme-heading'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {kind === 'rdp_claim' && (
              <p className="-mt-2 mb-4 text-xs text-theme-muted">
                Book a desktop for each day. Once an admin approves, that RDP is held for you during those hours.
                {rdps.length === 0 && ' No desktops have been offered to you yet — ask an admin.'}
              </p>
            )}
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
                      {kind === 'rdp_claim' && (
                        <label className="flex items-center gap-2 text-xs text-theme-muted">
                          <Monitor size={13} />
                          <select
                            value={days[i].rdpId}
                            onChange={(e) => updateDay(i, 'rdpId', e.target.value)}
                            className="bg-brand-surface-high border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-accent/50"
                          >
                            <option value="">Choose RDP…</option>
                            {rdps.map((r) => (
                              <option key={r.id} value={r.id}>{r.nickname}{r.country ? ` · ${r.country}` : ''}</option>
                            ))}
                          </select>
                        </label>
                      )}
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
        </>
      )}
    </div>
  );
}
