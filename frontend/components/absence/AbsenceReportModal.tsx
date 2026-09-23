'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

import AbsenceReportForm, { type AbsenceFormShift } from './AbsenceReportForm';
import type { AbsenceReport } from '@/lib/absence-reports';

interface AbsenceReportModalProps {
  open: boolean;
  /** Upcoming shifts to choose from — omit when a shift is already locked. */
  shifts?: AbsenceFormShift[];
  /** Opened from one shift row rather than the dashboard. */
  lockedShift?: AbsenceFormShift | null;
  /** Opened to correct a report that already exists. */
  existingReport?: AbsenceReport | null;
  onClose: () => void;
  onSubmitted: (report: AbsenceReport) => void;
}

/**
 * Worker-facing wrapper for the absence template.
 *
 * Workers get a popup wherever they are; admins get the same form on a full
 * page. Everything inside the chrome is the shared component, so the two
 * surfaces cannot drift apart.
 */
export default function AbsenceReportModal({
  open,
  shifts = [],
  lockedShift = null,
  existingReport = null,
  onClose,
  onSubmitted,
}: AbsenceReportModalProps) {
  const [mounted, setMounted] = useState(false);
  const [amending, setAmending] = useState<AbsenceReport | null>(existingReport);

  useEffect(() => {
    setMounted(true);
  }, []);

  // A fresh open is a fresh form — otherwise the amend heading would linger
  // after the worker closes the duplicate hand-off and starts a new report.
  useEffect(() => {
    if (open) setAmending(existingReport);
  }, [open, existingReport]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-md p-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="absence-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-modal relative z-10 w-full max-w-lg rounded-2xl border border-theme p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-400">
              <AlertTriangle size={16} />
            </span>
            <div className="min-w-0">
              <h2 id="absence-modal-title" className="text-base font-bold text-theme-heading">
                {amending ? 'Amend your absence report' : 'Report an absence'}
              </h2>
              <p className="text-xs text-theme-muted mt-0.5">
                {amending
                  ? 'Change what you sent — the admin sees the corrected version.'
                  : 'Let the admin know before the shift so cover can be arranged.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-theme-muted hover:text-theme-heading"
          >
            <X size={16} />
          </button>
        </div>

        <AbsenceReportForm
          compact
          shifts={shifts}
          lockedShift={lockedShift}
          existingReport={existingReport}
          onAmendingChange={setAmending}
          onSubmitted={onSubmitted}
          onCancel={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}
