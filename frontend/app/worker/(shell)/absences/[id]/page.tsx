'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Ban } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import SpinningDots from '@/components/shared/SpinningDots';
import AbsenceAttachments from '@/components/absence/AbsenceAttachments';
import AbsenceReportForm, { type AbsenceFormShift } from '@/components/absence/AbsenceReportForm';
import { api } from '@/lib/api';
import { reportError } from '@/lib/errors';
import {
  ABSENCE_REASON_LABELS,
  getAbsenceReport,
  reviewAbsenceReport,
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

/**
 * One of the worker's own absence reports, on its own page.
 *
 * This is the amend surface the schedule links to: a pending report opens in
 * the same form that filed it, so correcting a date or adding the sick note
 * that arrived late never means sending a second report.
 */
export default function WorkerAbsenceReportPage() {
  const { id } = useParams<{ id: string }>();

  const [report, setReport] = useState<AbsenceReport | null>(null);
  const [shift, setShift] = useState<AbsenceFormShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const found = await getAbsenceReport(id);
      setReport(found);
      if (found.shift_id) {
        // Only for the label on the form — a missing shift must not break the page.
        const shifts = await api
          .get<AbsenceFormShift[]>('/shifts?upcoming=true')
          .catch(() => [] as AbsenceFormShift[]);
        setShift(shifts.find((s) => s.id === found.shift_id) ?? null);
      }
    } catch (err) {
      setError(reportError('Load absence report', err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const withdraw = async () => {
    setError(null);
    setWithdrawing(true);
    try {
      setReport(await reviewAbsenceReport(id, { status: 'withdrawn' }));
      setSaved(false);
    } catch (err) {
      setError(reportError('Withdraw absence report', err));
    } finally {
      setWithdrawing(false);
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
      <div className="max-w-3xl mx-auto space-y-4">
        <p className="text-sm text-danger">{error ?? 'Absence report not found.'}</p>
        <Link
          href="/worker/absences"
          className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
        >
          <ArrowLeft size={14} />
          Back to my reports
        </Link>
      </div>
    );
  }

  const pending = report.status === 'pending';
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-theme-muted mb-1.5';

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-10">
      <PageHeader
        title={pending ? 'Amend your absence report' : 'Absence report'}
        description={`Filed ${when(report.created_at)}`}
        besideTitle={<StatusBadge status={report.status} />}
        actions={
          <Link
            href="/worker/absences"
            className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
          >
            <ArrowLeft size={14} />
            My reports
          </Link>
        }
      />

      {saved && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-emerald-accent" />
          <p className="text-xs text-emerald-accent">
            <span className="font-bold">Changes saved</span> — the admin now sees the
            corrected report. Nothing was submitted twice.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {pending ? (
        <>
          <section className="glass-panel rounded-2xl border border-white/5 p-5 md:p-6">
            <AbsenceReportForm
              existingReport={report}
              lockedShift={shift}
              onSubmitted={(updated) => {
                setReport(updated);
                setSaved(true);
              }}
            />
          </section>

          <section className="glass-panel rounded-2xl border border-white/5 p-5 md:p-6">
            <h2 className="text-sm font-bold text-theme-heading">
              Reported by mistake?
            </h2>
            <p className="mt-1 text-xs text-theme-muted">
              Withdrawing takes the report off the admin&apos;s queue and clears the
              mark on the shift. You can report again afterwards.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={withdrawing}
                onClick={withdraw}
                className="inline-flex items-center gap-2 rounded-xl bg-danger/90 px-4 py-2 text-sm font-semibold text-white hover:bg-danger disabled:opacity-50"
              >
                {withdrawing ? <SpinningDots size="sm" /> : <Ban size={14} />}
                Withdraw report
              </button>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="glass-panel rounded-2xl border border-white/5 p-5 md:p-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className={label}>Reason</p>
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <AlertTriangle size={14} className="text-amber-400" />
                  {ABSENCE_REASON_LABELS[report.reason_category] ?? report.reason_category}
                </p>
              </div>
              <div>
                <p className={label}>Decision</p>
                <p className="text-sm text-white">
                  <span className="font-semibold capitalize">{report.status}</span>
                  {report.reviewed_at ? ` · ${when(report.reviewed_at)}` : ''}
                </p>
              </div>
              <div>
                <p className={label}>Absent from</p>
                <p className="font-mono text-sm text-white">{when(report.absence_start)}</p>
              </div>
              <div>
                <p className={label}>Until</p>
                <p className="font-mono text-sm text-white">{when(report.absence_end)}</p>
              </div>
            </div>

            <div>
              <p className={label}>What you told the admin</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">
                {report.reason_text}
              </p>
            </div>

            {report.admin_note && (
              <div>
                <p className={label}>Admin note</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-theme-muted">
                  {report.admin_note}
                </p>
              </div>
            )}

            <p className="text-xs text-theme-muted">
              A reviewed report can no longer be changed.
            </p>
          </section>

          <section className="glass-panel rounded-2xl border border-white/5 p-5 md:p-6">
            <h2 className="mb-4 text-sm font-bold text-theme-heading">Evidence you sent</h2>
            <AbsenceAttachments
              paths={report.attachment_paths}
              emptyMessage="You did not attach any evidence to this report."
            />
          </section>
        </>
      )}
    </div>
  );
}
