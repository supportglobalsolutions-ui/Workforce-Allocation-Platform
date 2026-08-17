'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Star, X } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

interface Worker {
  id: string;
  display_name: string;
  country: string;
}

interface Rating {
  score: number;
  reason_note: string | null;
}

interface QualityIndicator {
  id: string;
}

/** Eye-click modal: edit admin rating only. Scores live on the list. */
export default function WorkerQualityModal({
  worker,
  periodId,
  periodLabel,
  rating,
  onClose,
  onSaved,
}: {
  worker: Worker;
  periodId: string;
  periodLabel: string;
  rating?: Rating;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [score, setScore] = useState<number | null>(rating?.score ?? null);
  const [reason, setReason] = useState(rating?.reason_note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setScore(rating?.score ?? null);
    setReason(rating?.reason_note ?? '');
  }, [rating]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (score == null) {
      setError('Choose a rating from 1 to 5.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const indicator = await api.get<QualityIndicator>('/quality/default-indicator');
      await api.post('/quality/ratings', {
        worker_id: worker.id,
        indicator_id: indicator.id,
        score,
        reason_note: reason.trim() || null,
        session_id: null,
        payroll_period_id: periodId,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rating.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form onSubmit={save} className="glass-modal relative z-10 w-full max-w-md overflow-hidden rounded-2xl">
        <div className="flex items-start justify-between p-5 border-b border-white/[0.06]">
          <div>
            <p className="text-base font-bold text-theme-heading">{worker.display_name}</p>
            <p className="text-xs text-theme-muted mt-0.5">
              Admin rating · {periodLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-2">Score (1–5)</p>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
                    score != null && n <= score
                      ? 'bg-gold-accent/20 border-gold-accent/50 text-gold-accent'
                      : 'bg-white/[0.03] border-white/10 text-theme-muted hover:text-gold-accent'
                  }`}
                  aria-label={`${n} out of 5`}
                >
                  <Star size={17} fill={score != null && n <= score ? 'currentColor' : 'none'} />
                </button>
              ))}
              <span className="ml-2 text-sm font-bold text-theme-heading">
                {score == null ? 'Not rated' : `${score} / 5`}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-theme-muted">
              Contributes up to 20 points of the composite (each star ≈ 4 points).
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">
              Comment <span className="font-medium normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field resize-none"
              placeholder="Optional note…"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 pt-0">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
            {saving ? <SpinningDots size="sm" /> : <CheckCircle size={14} />}
            {rating ? 'Update rating' : 'Save rating'}
          </button>
        </div>
      </form>
    </div>
  );
}
