'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCircle, Eye, Star, X } from 'lucide-react';

interface PendingWorker {
  worker_id: string;
  display_name: string;
  country: string;
}

export default function PendingRatingsModal({
  periodLabel,
  pending,
  ratedCount,
  totalWorkers,
  onClose,
  onSelectWorker,
}: {
  periodLabel: string;
  pending: PendingWorker[];
  ratedCount: number;
  totalWorkers: number;
  onClose: () => void;
  onSelectWorker: (workerId: string) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pending-ratings-title"
    >
      <button
        type="button"
        aria-label="Close pending ratings"
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="glass-modal relative z-10 flex w-full max-w-2xl max-h-[min(70vh,32rem)] flex-col overflow-hidden rounded-2xl">
        <header className="relative shrink-0 border-b border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold-accent/40 bg-gold-accent/15 text-gold-accent">
                <Bell size={18} />
              </span>
              <div className="min-w-0">
                <p id="pending-ratings-title" className="text-base font-bold text-theme-heading">
                  Pending ratings
                </p>
                <p className="mt-0.5 text-xs text-theme-muted">
                  <span className="font-semibold text-theme-heading">{pending.length}</span>
                  {' '}worker{pending.length === 1 ? '' : 's'} still need a score for{' '}
                  <span className="font-semibold text-gold-accent">{periodLabel}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-accent/30 bg-gold-accent/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-accent">
                    <Star size={10} fill="currentColor" />
                    {ratedCount}/{totalWorkers} rated
                  </span>
                  {pending.length > 0 && (
                    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-theme-muted">
                      {pending.length} remaining
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-theme-muted transition-colors hover:bg-white/5 hover:text-theme-heading"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {pending.length > 0 ? (
          <ul className="relative flex-1 overflow-y-auto divide-y divide-white/[0.06]">
            {pending.map((worker, index) => (
              <li key={worker.worker_id}>
                <button
                  type="button"
                  onClick={() => onSelectWorker(worker.worker_id)}
                  className="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03] sm:px-6"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold-accent/30 bg-gold-accent/10 text-[11px] font-black text-gold-accent tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-theme-heading">
                      {worker.display_name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-theme-muted">
                      {worker.country || 'Unassigned'}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 px-3 py-2 text-xs font-bold text-emerald-accent transition-colors group-hover:border-emerald-accent/50 group-hover:bg-emerald-accent/20">
                    <Eye size={14} /> Rate
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="relative flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent">
              <CheckCircle size={22} />
            </span>
            <p className="text-sm font-semibold text-emerald-accent">
              Everyone is rated for {periodLabel}
            </p>
            <p className="text-xs text-theme-muted">No pending admin ratings for this working month.</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
