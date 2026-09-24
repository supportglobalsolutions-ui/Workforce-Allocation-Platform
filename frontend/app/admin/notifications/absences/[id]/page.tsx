'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Ban, Check, Clock, User } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import SpinningDots from '@/components/shared/SpinningDots';
import AbsenceAttachments from '@/components/absence/AbsenceAttachments';
import { reportError } from '@/lib/errors';
import {
  ABSENCE_REASON_LABELS,
  getAbsenceReport,
  reviewAbsenceReport,
  shiftWindowLabel,
  type AbsenceReport,
} from '@/lib/absence-reports';

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AbsenceReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [report, setReport] = useState<AbsenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'accepted' | 'declined' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(await getAbsenceReport(id));
    } catch (err) {
      setError(reportError('Load absence report', err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (status: 'accepted' | 'declined') => {
    if (status === 'declined' && !note.trim()) {
      setError('Tell the worker why the report was declined.');
      return;
    }
    setError(null);
    setBusy(status);
    try {
      // cancel_shift defaults true server-side — accepting takes the shift off
      // the roster, which is the agreed behaviour.
      const updated = await reviewAbsenceReport(id, {
        status,
        admin_note: note.trim() || undefined,
      });
      setReport(updated);
      setNote('');
    } catch (err) {
      setError(reportError('Review absence report', err));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <SpinningDots size="lg" className="text-emerald-accent" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-danger">{error ?? 'Absence report not found.'}</p>
        <Link href="/admin/notifications/absences" className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
          <ArrowLeft size={14} />
          Back to absence reports
        </Link>
      </div>
    );
  }

  const pending = report.status === 'pending';
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-theme-muted mb-1.5';

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Absence report"
        description={`Filed ${when(report.created_at)}`}
        besideTitle={<StatusBadge status={report.status} />}
        actions={
          <button
            type="button"
            onClick={() => router.push('/admin/notifications/absences')}
            className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        }
      />

      {/* Who and when */}
      <section className="glass-panel rounded-2xl border border-white/5 p-5 md:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={label}>Worker</p>
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <User size={14} className="text-theme-muted" />
              {report.worker_name ?? 'Unknown worker'}
            </p>
          </div>
          <div>
            <p className={label}>Reason</p>
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <AlertTriangle size={14} className="text-amber-400" />
              {ABSENCE_REASON_LABELS[report.reason_category] ?? report.reason_category}
            </p>
          </div>
          <div>
            <p className={label}>Absent from</p>
            <p className="text-sm text-white font-mono">{when(report.absence_start)}</p>
          </div>
          <div>
            <p className={label}>Until</p>
            <p className="text-sm text-white font-mono">{when(report.absence_end)}</p>
          </div>
        </div>

        <div>
          <p className={label}>Linked shift</p>
          {report.shift_id ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-white">
              <Clock size={14} className="text-theme-muted" />
              {/* The window, not the id — an admin deciding on cover needs to
                  know which hours are about to go uncovered. */}
              <span className="font-semibold">
                {shiftWindowLabel(report) ?? 'Shift no longer on the roster'}
              </span>
              {report.shift_status && (
                <StatusBadge status={report.shift_status} />
              )}
            </p>
          ) : (
            <p className="text-sm text-theme-muted">
              Not tied to a shift — a declared date range.
            </p>
          )}
        </div>

        <div>
          <p className={label}>What happened</p>
          <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">
            {report.reason_text}
          </p>
        </div>
      </section>

      {/* Evidence */}
      <section className="glass-panel rounded-2xl border border-white/5 p-5 md:p-6">
        <h2 className="text-sm font-bold text-theme-heading mb-4">Evidence</h2>
        <AbsenceAttachments paths={report.attachment_paths} />
      </section>

      {/* Decision */}
      <section className="glass-panel rounded-2xl border border-white/5 p-5 md:p-6 space-y-4">
        <h2 className="text-sm font-bold text-theme-heading">Decision</h2>

        {pending ? (
          <>
            <div>
              <label className={label} htmlFor="absence-note">
                Note to the worker{' '}
                <span className="font-medium normal-case tracking-normal">
                  (required when declining)
                </span>
              </label>
              <textarea
                id="absence-note"
                rows={3}
                value={note}
                disabled={busy !== null}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-brand-surface-high border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-accent/50 disabled:opacity-60 resize-y"
                placeholder="They will see this with the decision in their notifications."
              />
            </div>

            {report.shift_id && (
              <p className="text-xs text-theme-muted">
                Accepting cancels the linked shift and frees any machine reserved for it.
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => decide('declined')}
                className="text-sm py-2 px-4 inline-flex items-center gap-2 rounded-xl font-semibold bg-danger/90 text-white hover:bg-danger disabled:opacity-50"
              >
                {busy === 'declined' ? <SpinningDots size="sm" /> : <Ban size={14} />}
                Decline
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => decide('accepted')}
                className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {busy === 'accepted' ? <SpinningDots size="sm" /> : <Check size={14} />}
                Accept
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-white">
              <span className="font-semibold capitalize">{report.status}</span>
              {report.reviewer_name ? ` by ${report.reviewer_name}` : ''}
              {report.reviewed_at ? ` · ${when(report.reviewed_at)}` : ''}
            </p>
            {report.admin_note && (
              <p className="text-sm text-theme-muted leading-relaxed whitespace-pre-wrap">
                {report.admin_note}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </section>
    </div>
  );
}
