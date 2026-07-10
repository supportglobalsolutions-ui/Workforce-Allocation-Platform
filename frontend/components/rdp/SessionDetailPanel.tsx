'use client';

import { X } from 'lucide-react';
import StatusBadge from '@/components/platform/StatusBadge';
import SessionImageUpload from './SessionImageUpload';

interface SessionDetail {
  id: string;
  date: string;
  machine: string;
  type: string;
  duration: string;
  status: string;
  start_image_url: string | null;
  end_image_url: string | null;
}

interface Props {
  session: SessionDetail | null;
  onClose: () => void;
  onImageUploaded: (sessionId: string, type: 'start' | 'end', url: string) => void;
  workerLabel?: string;
}

export default function SessionDetailPanel({ session, onClose, onImageUploaded, workerLabel }: Props) {
  if (!session) return null;

  return (
    /* Backdrop — near-opaque so background is completely invisible */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'rgba(0,0,0,0.97)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* White card */}
      <div className="w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl">

        {/* Emerald top bar */}
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400" />

        {/* Header */}
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

        {/* Session meta */}
        <div className="px-6 py-4 grid grid-cols-3 gap-4 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Type</p>
            <p className="text-sm font-medium text-gray-800">{session.type}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Duration</p>
            <p className="text-sm font-medium text-gray-800">{session.duration}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Status</p>
            <StatusBadge status={session.status} />
          </div>
        </div>

        {/* Images — side by side */}
        <div className="px-6 py-5 grid grid-cols-2 gap-5">
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
            />
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
            />
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-6 pb-5">
          <p className="text-center text-[11px] text-gray-300">
            Hover any thumbnail · click Inspect for the full-screen magnifier
          </p>
        </div>
      </div>
    </div>
  );
}
