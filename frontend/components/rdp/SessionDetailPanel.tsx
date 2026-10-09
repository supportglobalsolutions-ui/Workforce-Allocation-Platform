'use client';

import { useEffect, useState } from 'react';
import { Flag, Plus, X } from 'lucide-react';
import StatusBadge from '@/components/platform/StatusBadge';
import SessionImageGallery from './SessionImageGallery';
import { api } from '@/lib/api';
import { rdpConnectedMinutes } from '@/lib/hours';

interface SessionDetail {
  id: string;
  date: string;
  machine: string;
  type: string;
  duration: string;
  start_time?: string | null;
  end_time?: string | null;
  rdp_minutes?: number | null;
  status: string;
  /** Legacy pair, still present on rows written before the gallery. */
  start_image_url: string | null;
  end_image_url: string | null;
  /** Evidence screenshots, in capture order. */
  image_urls?: string[] | null;
  image_start_at?: string | null;
  image_end_at?: string | null;
  /** Worked blocks inside the session (breaks excluded), at most 10. */
  work_blocks?: { start: string; end: string }[] | null;
  evidence_complete?: boolean | null;
  duration_minutes?: number | null;
  /** Admin-only review flag — never shown to workers. */
  suspicious?: boolean;
}

interface Props {
  session: SessionDetail | null;
  onClose: () => void;
  onImagesChanged: (sessionId: string, paths: string[]) => void;
  onEvidenceSaved?: (sessionId: string, patch: Partial<SessionDetail>) => void;
  onSuspiciousChanged?: (sessionId: string, suspicious: boolean) => void;
  workerLabel?: string;
  allowEvidenceEdit?: boolean;
  /** Workers upload; admins inspect only. */
  allowUpload?: boolean;
  /** Admin-only: show and toggle the suspicious review flag. */
  allowSuspiciousFlag?: boolean;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatClock(iso: string | null | undefined): string {
  if (!iso) return 'Not entered';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not entered';
  return d.toLocaleString();
}

function formatMins(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const MAX_BLOCKS = 10;

interface BlockDraft { start: string; end: string }

/** Saved blocks, else the single start/end pair, else one empty row. */
function initialBlocks(session: SessionDetail | null): BlockDraft[] {
  const saved = session?.work_blocks ?? [];
  if (saved.length) return saved.map((b) => ({ start: toLocalInput(b.start), end: toLocalInput(b.end) }));
  if (session?.image_start_at || session?.image_end_at) {
    return [{ start: toLocalInput(session.image_start_at), end: toLocalInput(session.image_end_at) }];
  }
  return [{ start: '', end: '' }];
}

function localToIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function minutesBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.floor((endMs - startMs) / 60_000);
}

export default function SessionDetailPanel({
  session,
  onClose,
  onImagesChanged,
  onEvidenceSaved,
  onSuspiciousChanged,
  workerLabel,
  allowEvidenceEdit = true,
  allowUpload = true,
  allowSuspiciousFlag = false,
}: Props) {
  const [blocks, setBlocks] = useState<BlockDraft[]>(() => initialBlocks(session));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suspicious, setSuspicious] = useState(Boolean(session?.suspicious));
  const [flagBusy, setFlagBusy] = useState(false);

  useEffect(() => {
    setBlocks(initialBlocks(session));
    setSuspicious(Boolean(session?.suspicious));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.image_start_at, session?.image_end_at, session?.work_blocks, session?.suspicious]);

  if (!session) return null;

  // Work time = sum of the blocks; the breaks between them are not counted.
  const blockMins = blocks.map((b) => minutesBetween(localToIso(b.start), localToIso(b.end)));
  const draftWorkMinutes = blockMins.every((m) => m != null)
    ? blockMins.reduce<number>((sum, m) => sum + (m ?? 0), 0)
    : null;
  const savedWorkMinutes = session.duration_minutes
    ?? minutesBetween(session.image_start_at, session.image_end_at);
  const workMinutes = allowEvidenceEdit ? (draftWorkMinutes ?? savedWorkMinutes) : savedWorkMinutes;
  const lastBlock = blocks[blocks.length - 1];
  const canAddBlock = blocks.length < MAX_BLOCKS && !!lastBlock?.start && !!lastBlock?.end;
  const allFilled = blocks.every((b) => b.start && b.end);
  const updateBlock = (i: number, key: keyof BlockDraft, value: string) =>
    setBlocks((prev) => prev.map((b, j) => (j === i ? { ...b, [key]: value } : b)));
  const rdpMinutes = session.rdp_minutes
    ?? rdpConnectedMinutes({ start_time: session.start_time, end_time: session.end_time });
  const showRdp = formatMins(rdpMinutes);

  const saveEvidence = async () => {
    if (!allowEvidenceEdit) return;
    if (!allFilled) {
      setError('Enter a start time and an end time for every block.');
      return;
    }
    if (draftWorkMinutes == null) {
      setError('Each end time must be after its start time.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        work_blocks: blocks.map((b) => ({ start: localToIso(b.start), end: localToIso(b.end) })),
      };
      const updated = await api.patch<{
        duration_minutes: number | null;
        image_start_at: string | null;
        image_end_at: string | null;
        work_blocks: { start: string; end: string }[];
        evidence_complete: boolean;
      }>(`/sessions/${session.id}/evidence`, body);
      onEvidenceSaved?.(session.id, {
        image_start_at: updated.image_start_at,
        image_end_at: updated.image_end_at,
        work_blocks: updated.work_blocks,
        duration_minutes: updated.duration_minutes,
        evidence_complete: updated.evidence_complete,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save times');
    } finally {
      setSaving(false);
    }
  };

  const toggleSuspicious = async () => {
    if (!allowSuspiciousFlag || flagBusy) return;
    const next = !suspicious;
    setFlagBusy(true);
    setError(null);
    try {
      await api.patch(`/sessions/${session.id}`, { suspicious: next });
      setSuspicious(next);
      onSuspiciousChanged?.(session.id, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update flag');
    } finally {
      setFlagBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl"
      style={{ WebkitBackdropFilter: 'blur(24px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400" />

        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-[15px] font-bold text-gray-900">{session.machine}</p>
            {workerLabel && (
              <p className="text-xs font-medium text-emerald-600 mt-0.5">{workerLabel}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">{session.date}</p>
            {allowSuspiciousFlag && suspicious && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 border border-amber-200">
                <Flag size={10} />
                Suspicious
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Type</p>
            <p className="text-sm font-medium text-gray-800">{session.type}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5" title="Tracked automatically: how long the RDP was on">Uptime (RDP on)</p>
            <p className="text-sm font-bold text-gray-800 tabular-nums">{showRdp}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 mb-0.5">Work hours</p>
            <p className={`text-sm font-bold tabular-nums ${workMinutes == null ? 'text-gray-400' : 'text-emerald-700'}`}>
              {workMinutes == null ? '—' : formatMins(workMinutes)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Status</p>
            <StatusBadge status={session.status} />
          </div>
        </div>

        {allowSuspiciousFlag && (
          <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">Mark suspicious</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Use when screenshots do not match the claimed times. Workers never see this flag.
              </p>
            </div>
            <button
              type="button"
              disabled={flagBusy}
              onClick={() => void toggleSuspicious()}
              aria-pressed={suspicious}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-colors disabled:opacity-50 ${
                suspicious
                  ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <Flag size={12} />
              {flagBusy ? 'Saving…' : suspicious ? 'Flagged' : 'Flag'}
            </button>
          </div>
        )}

        <div className="px-4 sm:px-6 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600 mb-2.5">
            Session screenshots
          </p>
          <SessionImageGallery
            sessionId={session.id}
            initialUrls={
              (session.image_urls ?? []).length > 0
                ? session.image_urls
                : [session.start_image_url, session.end_image_url].filter(Boolean) as string[]
            }
            label="Session screenshot"
            onChanged={(paths) => onImagesChanged(session.id, paths)}
            readOnly={!allowUpload}
          />
        </div>

        <div className="px-4 sm:px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600">Work times</p>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            {allowEvidenceEdit
              ? 'Took a break? Add each stretch you worked as its own block. Work hours are the total of all blocks.'
              : 'Each stretch worked; breaks between them are not counted.'}
          </p>
          <div className="space-y-2.5">
            {blocks.map((b, i) => (
              <div key={i} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Block {i + 1}{blockMins[i] != null ? ` · ${formatMins(blockMins[i])}` : ''}
                  </span>
                  {allowEvidenceEdit && blocks.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove block ${i + 1}`}
                      onClick={() => setBlocks((prev) => prev.filter((_, j) => j !== i))}
                      className="w-6 h-6 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                {allowEvidenceEdit ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Start time</span>
                      <input
                        type="datetime-local"
                        required
                        value={b.start}
                        onChange={(e) => updateBlock(i, 'start', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-800"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">End time</span>
                      <input
                        type="datetime-local"
                        required
                        value={b.end}
                        onChange={(e) => updateBlock(i, 'end', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-800"
                      />
                    </label>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">
                    {formatClock(localToIso(b.start))} → {formatClock(localToIso(b.end))}
                  </p>
                )}
              </div>
            ))}
          </div>
          {allowEvidenceEdit && canAddBlock && (
            <button
              type="button"
              onClick={() => setBlocks((prev) => [...prev, { start: '', end: '' }])}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              <Plus size={13} /> Add another block ({blocks.length}/{MAX_BLOCKS})
            </button>
          )}
        </div>

        {error && <p className="px-6 text-xs text-red-600 mb-2">{error}</p>}

        {allowEvidenceEdit && (
          <div className="px-6 pb-6">
            <button
              type="button"
              disabled={saving || !allFilled}
              onClick={saveEvidence}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5"
            >
              {saving ? 'Saving…' : 'Save times'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
