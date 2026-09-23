'use client';

import { useMemo, useRef, useState } from 'react';
import { FileText, ImageIcon, Paperclip, Save, Send, X } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { AppError } from '@/lib/errors';
import {
  ABSENCE_REASONS,
  MAX_ABSENCE_ATTACHMENTS,
  MIN_REASON_CHARS,
  amendAbsenceReport,
  createAbsenceReport,
  findOpenReportForShift,
  isPdf,
  removeAbsenceAttachment,
  uploadAbsenceAttachment,
  validateAttachment,
  type AbsenceReason,
  type AbsenceReport,
} from '@/lib/absence-reports';

export interface AbsenceFormShift {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
}

interface AbsenceReportFormProps {
  /** Upcoming shifts the worker can pick from. Empty is fine. */
  shifts?: AbsenceFormShift[];
  /** Opened from one shift — that shift is fixed and the picker is hidden. */
  lockedShift?: AbsenceFormShift | null;
  /** Amending a report that already exists rather than filing a new one. */
  existingReport?: AbsenceReport | null;
  onSubmitted: (report: AbsenceReport) => void;
  onCancel?: () => void;
  /** Rendered inside a modal (worker) vs. on a page. Only affects spacing. */
  compact?: boolean;
  /**
   * Fires when the form flips from filing to amending — either because it
   * opened that way or because a duplicate was caught on submit. Lets the
   * wrapper retitle itself so the worker is not still reading "Report an
   * absence" while editing one.
   */
  onAmendingChange?: (report: AbsenceReport | null) => void;
}

const NO_SHIFT = '__none__';

function shiftLabel(s: AbsenceFormShift): string {
  const start = new Date(s.scheduled_start);
  const end = new Date(s.scheduled_end);
  return `${start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} · ${start.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}–${end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

/** `datetime-local` wants local wall-clock with no zone suffix. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return toLocalInput(d.toISOString());
}

function defaultEnd(): string {
  const d = new Date();
  d.setHours(d.getHours() + 8, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

function filedOn(report: AbsenceReport): string {
  return new Date(report.created_at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * The one absence-report template.
 *
 * Rendered identically from the worker dashboard (nothing pre-selected), from
 * a single shift (that shift locked in), and from the worker's own report page
 * (amending) — the only difference is which props arrive, never the markup.
 *
 * A worker who files twice for the same shift is corrected, not blocked: the
 * server refuses the duplicate, the form fetches the report already on file
 * and turns itself into an amend of that report, keeping everything just
 * typed. Double submission becomes a correction in one step.
 */
export default function AbsenceReportForm({
  shifts = [],
  lockedShift = null,
  existingReport = null,
  onSubmitted,
  onCancel,
  compact = false,
  onAmendingChange,
}: AbsenceReportFormProps) {
  const [amending, setAmending] = useState<AbsenceReport | null>(existingReport);
  /** Set only when a duplicate flipped the form mid-submit. */
  const [duplicateOf, setDuplicateOf] = useState<AbsenceReport | null>(null);

  const [shiftId, setShiftId] = useState<string>(
    existingReport?.shift_id ?? lockedShift?.id ?? NO_SHIFT,
  );
  const [start, setStart] = useState(() => {
    if (existingReport) return toLocalInput(existingReport.absence_start);
    return lockedShift ? toLocalInput(lockedShift.scheduled_start) : defaultStart();
  });
  const [end, setEnd] = useState(() => {
    if (existingReport) return toLocalInput(existingReport.absence_end);
    return lockedShift ? toLocalInput(lockedShift.scheduled_end) : defaultEnd();
  });
  const [reason, setReason] = useState<AbsenceReason>(
    existingReport?.reason_category ?? 'illness',
  );
  const [text, setText] = useState(existingReport?.reason_text ?? '');
  const [savedPaths, setSavedPaths] = useState<string[]>(
    existingReport?.attachment_paths ?? [],
  );
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const selectedShift = useMemo(
    () => lockedShift ?? shifts.find((s) => s.id === shiftId) ?? null,
    [lockedShift, shifts, shiftId],
  );

  /** Picking a shift fixes the window — no reason to ask twice. */
  const datesFromShift = selectedShift !== null && !amending;
  const remaining = MIN_REASON_CHARS - text.trim().length;
  const canSubmit = !busy && remaining <= 0;
  const attachmentCount = savedPaths.length + files.length;

  const enterAmendMode = (report: AbsenceReport) => {
    setAmending(report);
    setSavedPaths(report.attachment_paths ?? []);
    onAmendingChange?.(report);
  };

  const pickShift = (value: string) => {
    setShiftId(value);
    const s = shifts.find((x) => x.id === value);
    if (s) {
      setStart(toLocalInput(s.scheduled_start));
      setEnd(toLocalInput(s.scheduled_end));
    }
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    setError(null);
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (savedPaths.length + next.length >= MAX_ABSENCE_ATTACHMENTS) {
        setError(`You can attach at most ${MAX_ABSENCE_ATTACHMENTS} files.`);
        break;
      }
      const problem = validateAttachment(file);
      if (problem) {
        setError(`${file.name}: ${problem}`);
        continue;
      }
      next.push(file);
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = '';
  };

  const dropSavedFile = async (path: string) => {
    if (!amending) return;
    setError(null);
    setBusy(true);
    try {
      const result = await removeAbsenceAttachment(amending.id, path);
      setSavedPaths(result.attachment_paths);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that file');
    } finally {
      setBusy(false);
    }
  };

  /** Upload whatever is staged onto a report that now exists. */
  const uploadStaged = async (report: AbsenceReport) => {
    let saved = report;
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading file ${i + 1} of ${files.length}…`);
      const result = await uploadAbsenceAttachment(report.id, files[i]);
      saved = { ...saved, attachment_paths: result.attachment_paths };
    }
    return saved;
  };

  const handleSubmit = async () => {
    setError(null);

    const startIso = new Date(start).toISOString();
    const endIso = new Date(end).toISOString();
    if (new Date(endIso) <= new Date(startIso)) {
      setError('The end of the absence must be after the start.');
      return;
    }

    const body = {
      absence_start: startIso,
      absence_end: endIso,
      reason_category: reason,
      reason_text: text.trim(),
    };

    setBusy(true);
    try {
      if (amending) {
        setProgress('Saving changes…');
        const updated = await amendAbsenceReport(amending.id, body);
        const saved = await uploadStaged(updated);
        setFiles([]);
        setSavedPaths(saved.attachment_paths);
        setAmending(saved);
        onSubmitted(saved);
        return;
      }

      setProgress('Submitting report…');
      let report: AbsenceReport;
      try {
        report = await createAbsenceReport({
          shift_id: selectedShift?.id ?? null,
          ...body,
        });
      } catch (e) {
        // A duplicate is a correction in disguise. Pull up the report already
        // on file and let them save over it instead of bouncing an error.
        const duplicate =
          e instanceof AppError && e.status === 409 && selectedShift
            ? await findOpenReportForShift(selectedShift.id)
            : null;
        if (!duplicate) throw e;
        enterAmendMode(duplicate);
        setDuplicateOf(duplicate);
        setError(null);
        return;
      }

      // The report exists now, so attachments have a folder to land in.
      const saved = await uploadStaged(report);
      onSubmitted(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the report');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const field =
    'w-full bg-brand-surface-high border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-accent/50 disabled:opacity-60';
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-theme-muted mb-1.5';

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      {/* The double-submit hand-off: same form, now pointed at the old report. */}
      {duplicateOf && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-xs font-bold text-amber-300">
            You already reported this shift on {filedOn(duplicateOf)}
          </p>
          <p className="mt-1 text-xs text-amber-400/90">
            Nothing was sent twice. What you just filled in is now an amendment to
            that report — check it over and save.
          </p>
        </div>
      )}

      {/* Which shift */}
      {amending ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <p className={label}>Amending</p>
          <p className="text-sm font-semibold text-white">
            {lockedShift
              ? shiftLabel(lockedShift)
              : amending.shift_id
                ? 'The shift you reported'
                : 'Absence not tied to a shift'}
          </p>
          <p className="mt-1 text-[11px] text-theme-muted">
            Filed {filedOn(amending)} · awaiting review. Which shift it covers cannot
            be changed — withdraw and file again if you picked the wrong one.
          </p>
        </div>
      ) : lockedShift ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
          <p className={label}>Shift you will miss</p>
          <p className="text-sm font-semibold text-white">{shiftLabel(lockedShift)}</p>
        </div>
      ) : (
        <div>
          <label className={label} htmlFor="absence-shift">
            Which shift?
          </label>
          <select
            id="absence-shift"
            className={field}
            value={shiftId}
            disabled={busy}
            onChange={(e) => pickShift(e.target.value)}
          >
            <option value={NO_SHIFT}>Not tied to a shift — choose dates below</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {shiftLabel(s)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* When */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="absence-start">
            From
          </label>
          <input
            id="absence-start"
            type="datetime-local"
            className={field}
            value={start}
            disabled={busy || datesFromShift}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor="absence-end">
            Until
          </label>
          <input
            id="absence-end"
            type="datetime-local"
            className={field}
            value={end}
            disabled={busy || datesFromShift}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>
      {datesFromShift && (
        <p className="-mt-2 text-[11px] text-theme-muted">
          Dates come from the selected shift.
        </p>
      )}

      {/* Why */}
      <div>
        <label className={label} htmlFor="absence-reason">
          Reason
        </label>
        <select
          id="absence-reason"
          className={field}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value as AbsenceReason)}
        >
          {ABSENCE_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={label} htmlFor="absence-text">
          What happened?
        </label>
        <textarea
          id="absence-text"
          rows={4}
          className={`${field} resize-y`}
          placeholder="Tell the admin enough to act on without calling you back."
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-theme-muted">
          {remaining > 0
            ? `${remaining} more character${remaining === 1 ? '' : 's'} needed`
            : `${text.trim().length} characters`}
        </p>
      </div>

      {/* Evidence */}
      <div>
        <p className={label}>
          Evidence <span className="font-medium normal-case tracking-normal">(optional)</span>
        </p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <button
          type="button"
          disabled={busy || attachmentCount >= MAX_ABSENCE_ATTACHMENTS}
          onClick={() => fileInput.current?.click()}
          className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Paperclip size={14} />
          Attach a file
        </button>
        <p className="mt-1.5 text-[11px] text-theme-muted">
          PDF, JPG or PNG · up to {MAX_ABSENCE_ATTACHMENTS} files.{' '}
          {amending
            ? 'You can keep adding evidence until an admin decides.'
            : 'Send it later if you do not have it yet.'}
        </p>

        {(savedPaths.length > 0 || files.length > 0) && (
          <ul className="mt-3 space-y-2">
            {/* Already on the report — removing hits the server immediately. */}
            {savedPaths.map((path) => {
              const name = path.split('/').pop() ?? path;
              return (
                <li
                  key={path}
                  className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                >
                  <span className="shrink-0 text-theme-muted">
                    {isPdf(path) ? <FileText size={15} /> : <ImageIcon size={15} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-white">{name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-emerald-accent">
                    Sent
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Remove ${name}`}
                    onClick={() => dropSavedFile(path)}
                    className="shrink-0 text-theme-muted hover:text-danger disabled:opacity-50"
                  >
                    <X size={14} />
                  </button>
                </li>
              );
            })}

            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <span className="shrink-0 text-theme-muted">
                  {f.type === 'application/pdf' || /\.pdf$/i.test(f.name) ? (
                    <FileText size={15} />
                  ) : (
                    <ImageIcon size={15} />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-white">{f.name}</span>
                <span className="shrink-0 text-[11px] text-theme-muted font-mono">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                  className="shrink-0 text-theme-muted hover:text-danger disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {progress && <p className="text-sm text-theme-muted">{progress}</p>}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="btn-secondary text-sm py-2 px-4 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50"
        >
          {busy ? <SpinningDots size="sm" /> : amending ? <Save size={14} /> : <Send size={14} />}
          {busy ? 'Saving…' : amending ? 'Save changes' : 'Submit report'}
        </button>
      </div>
    </div>
  );
}
