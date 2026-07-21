'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Star, X } from 'lucide-react';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

export interface RateWorkerOption {
  id: string;
  display_name: string;
  country?: string;
}

interface QualityIndicator {
  id: string;
  scale_min: number;
  scale_max: number;
}

interface PayrollPeriodOption {
  id: string;
  label: string;
}

interface RateWorkerModalProps {
  workers: RateWorkerOption[];
  /** When set, worker select is locked to this worker (Workers page shortcut). */
  lockedWorkerId?: string;
  initialWorkerId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function RateWorkerModal({
  workers,
  lockedWorkerId,
  initialWorkerId,
  onClose,
  onSaved,
}: RateWorkerModalProps) {
  const [workerId, setWorkerId] = useState(lockedWorkerId ?? initialWorkerId ?? '');
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [periods, setPeriods] = useState<PayrollPeriodOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.get<PayrollPeriodOption[]>('/payroll/periods');
        if (cancelled) return;
        setPeriods(list);
        if (list.length > 0) {
          setPeriodId(list[0].id);
          setPeriodLabel(list[0].label);
        }
      } catch {
        if (!cancelled) setError('Could not load payroll periods.');
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workerId || score == null) {
      setError('Select a worker and a score.');
      return;
    }
      if (!periodId) {
      setError('No working month available — create one first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const indicator = await api.get<QualityIndicator>('/quality/default-indicator');
      await api.post('/quality/ratings', {
        worker_id: workerId,
        indicator_id: indicator.id,
        score,
        reason_note: reason.trim() || null,
        session_id: null,
        payroll_period_id: periodId,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rating');
    } finally {
      setSaving(false);
    }
  }

  const lockedWorker = lockedWorkerId
    ? workers.find((w) => w.id === lockedWorkerId)
    : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-bold text-white">Rate Worker</h2>
            {(periodLabel || loadingMeta) && (
              <p className="text-[11px] text-theme-muted mt-0.5">
                {loadingMeta ? 'Loading period…' : `Working month · ${periodLabel}`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-theme-muted leading-relaxed">
            Score contributes <span className="text-white/80 font-semibold">30%</span> of the composite
            leaderboard (averaged over the trailing 5 working months).
          </p>

          {periods.length > 1 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">
                Working Month
              </label>
              <select
                value={periodId}
                onChange={(e) => {
                  const id = e.target.value;
                  setPeriodId(id);
                  setPeriodLabel(periods.find((p) => p.id === id)?.label ?? '');
                }}
                className="input-field"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">
              Worker
            </label>
            {lockedWorker ? (
              <p className="text-sm font-medium text-white px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                {lockedWorker.display_name}
                {lockedWorker.country ? (
                  <span className="text-theme-muted font-normal"> · {lockedWorker.country}</span>
                ) : null}
              </p>
            ) : (
              <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="input-field" required>
                <option value="">Select a worker…</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.display_name}{w.country ? ` (${w.country})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">
              Score
            </label>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors border ${
                    score != null && n <= score
                      ? 'bg-gold-accent/20 border-gold-accent/50 text-gold-accent'
                      : 'bg-white/[0.03] border-white/10 text-theme-muted hover:text-gold-accent hover:border-gold-accent/30'
                  }`}
                  aria-label={`${n} out of 5`}
                >
                  <Star size={18} fill={score != null && n <= score ? 'currentColor' : 'none'} />
                </button>
              ))}
              <span className="ml-2 text-sm font-bold text-white tabular-nums">
                {score != null ? `${score} / 5` : '—'}
              </span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">
              Comment <span className="font-medium normal-case tracking-normal text-theme-muted/70">(optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Optional note…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={saving || loadingMeta} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" className="text-white" /> : <Star size={14} />}
              Save rating
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
