'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import StatusBadge from '@/components/platform/StatusBadge';
import SessionImageUpload from './SessionImageUpload';
import { api } from '@/lib/api';

interface SessionDetail {
  id: string;
  date: string;
  machine: string;
  type: string;
  duration: string;
  status: string;
  start_image_url: string | null;
  end_image_url: string | null;
  image_start_at?: string | null;
  image_end_at?: string | null;
  evidence_complete?: boolean | null;
  duration_minutes?: number | null;
}

interface Props {
  session: SessionDetail | null;
  onClose: () => void;
  onImageUploaded: (sessionId: string, type: 'start' | 'end', url: string) => void;
  onEvidenceSaved?: (sessionId: string, patch: Partial<SessionDetail>) => void;
  workerLabel?: string;
  allowEvidenceEdit?: boolean;
  /** Workers upload; admins inspect only. */
  allowUpload?: boolean;
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

export default function SessionDetailPanel({
  session,
  onClose,
  onImageUploaded,
  onEvidenceSaved,
  workerLabel,
  allowEvidenceEdit = true,
  allowUpload = true,
}: Props) {
  const [startAt, setStartAt] = useState(() => toLocalInput(session?.image_start_at));
  const [endAt, setEndAt] = useState(() => toLocalInput(session?.image_end_at));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationLabel, setDurationLabel] = useState(session?.duration ?? '—');

  useEffect(() => {
    setStartAt(toLocalInput(session?.image_start_at));
    setEndAt(toLocalInput(session?.image_end_at));
    setDurationLabel(session?.duration ?? formatMins(session?.duration_minutes) ?? '—');
  }, [session?.id, session?.image_start_at, session?.image_end_at, session?.duration, session?.duration_minutes]);

  if (!session) return null;

  const saveEvidence = async () => {
    if (!allowEvidenceEdit) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (startAt) body.image_start_at = new Date(startAt).toISOString();
      if (endAt) body.image_end_at = new Date(endAt).toISOString();
      const updated = await api.patch<{
        duration_minutes: number | null;
        image_start_at: string | null;
        image_end_at: string | null;
        evidence_complete: boolean;
      }>(`/sessions/${session.id}/evidence`, body);
      const mins = updated.duration_minutes;
      const label = mins != null ? formatMins(mins) : durationLabel;
      setDurationLabel(label);
      onEvidenceSaved?.(session.id, {
        image_start_at: updated.image_start_at,
        image_end_at: updated.image_end_at,
        duration_minutes: updated.duration_minutes,
        evidence_complete: updated.evidence_complete,
        duration: label,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save times');
    } finally {
      setSaving(false);
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
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Type</p>
            <p className="text-sm font-medium text-gray-800">{session.type}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Duration</p>
            <p className="text-sm font-medium text-gray-800">{durationLabel}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Status</p>
            <StatusBadge status={session.status} />
          </div>
        </div>

        <div className="px-4 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600 mb-2.5">
              Start image
            </p>
            <SessionImageUpload
              sessionId={session.id}
              imageType="start"
              label="Session start screenshot"
              initialUrl={session.start_image_url}
              onUploaded={(url) => onImageUploaded(session.id, 'start', url)}
              readOnly={!allowUpload}
            />
            {allowEvidenceEdit ? (
              <label className="block mt-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Time on start image</span>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-800"
                />
              </label>
            ) : (
              <p className="mt-3 text-xs text-gray-500">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Time on start image</span>
                {formatClock(session.image_start_at)}
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-600 mb-2.5">
              End image
            </p>
            <SessionImageUpload
              sessionId={session.id}
              imageType="end"
              label="Session end screenshot"
              initialUrl={session.end_image_url}
              onUploaded={(url) => onImageUploaded(session.id, 'end', url)}
              readOnly={!allowUpload}
            />
            {allowEvidenceEdit ? (
              <label className="block mt-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Time on end image</span>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-800"
                />
              </label>
            ) : (
              <p className="mt-3 text-xs text-gray-500">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Time on end image</span>
                {formatClock(session.image_end_at)}
              </p>
            )}
          </div>
        </div>

        {error && <p className="px-6 text-xs text-red-600 mb-2">{error}</p>}

        {allowEvidenceEdit && (
          <div className="px-6 pb-3">
            <button
              type="button"
              disabled={saving || (!startAt && !endAt)}
              onClick={saveEvidence}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5"
            >
              {saving ? 'Saving…' : 'Save on-image times & calculate duration'}
            </button>
          </div>
        )}

        <div className="px-6 pb-5">
          <p className="text-center text-[11px] text-gray-400">
            {allowUpload
              ? 'Enter the times shown on your screenshots — duration is calculated from those times.'
              : 'Click an image to inspect with the magnifying lens. Hours for payroll come from these start and end times.'}
          </p>
        </div>
      </div>
    </div>
  );
}
