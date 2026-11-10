'use client';

import { useState } from 'react';
import { Check, Pencil, RotateCcw, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoneyAmount } from '@/lib/money';

interface Summary {
  id: string;
  local_currency: string;
  gross_earned: string | number;
  calculated_gross?: string | number;
  gross_override?: string | number | null;
  final_confirmed_at?: string | null;
  final_confirmed_by_name?: string | null;
}

/**
 * Final gross for one worker: shows the gross actually used and lets the admin
 * enter a different final amount (raise or reduce). Deductions come off it on
 * the server. "Reset" goes back to the calculated gross.
 */
export function FinalGrossCell({ summary, locked, onSaved }: { summary: Summary; locked: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overridden = summary.gross_override != null;

  const save = async (next: number | null) => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/payroll/summaries/${summary.id}`, { gross_override: next });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <input
          type="number"
          min={0}
          step="0.01"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value !== '') void save(Number(value));
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-28 rounded-md border border-emerald-accent/40 bg-brand-surface-high px-2 py-1 text-right text-sm text-white"
          aria-label="Final gross"
        />
        <button type="button" disabled={busy || value === ''} onClick={() => void save(Number(value))}
          className="rounded-md p-1 text-emerald-accent hover:bg-emerald-accent/10 disabled:opacity-40" aria-label="Save final gross">
          <Check size={14} />
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-md p-1 text-theme-muted hover:text-theme-heading" aria-label="Cancel">
          <X size={14} />
        </button>
        {error && <span className="text-[10px] text-danger">{error}</span>}
      </div>
    );
  }

  const start = () => { setValue(String(Number(summary.gross_earned))); setEditing(true); };

  return (
    <div className="group flex items-center justify-end gap-1.5">
      <span className={`tabular-nums ${overridden ? 'font-bold text-gold-accent' : 'text-theme-heading'} ${locked ? '' : 'cursor-text'}`}
        onClick={locked ? undefined : start}>
        {formatMoneyAmount(summary.gross_earned, summary.local_currency)}
      </span>
      {!locked && (
        <>
          <button
            type="button"
            onClick={start}
            title="Enter final gross — raise or reduce what this worker is paid before deductions"
            className="rounded-md p-1 text-theme-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-emerald-accent hover:bg-emerald-accent/10"
            aria-label="Enter final gross"
          >
            <Pencil size={12} />
          </button>
          {overridden && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(null)}
              title="Go back to the calculated gross (rate × hours + bonus)"
              className="rounded-md p-1 text-theme-muted hover:text-amber-400 disabled:opacity-40"
              aria-label="Reset to calculated gross"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Difference = final gross − calculated gross (shown only when the admin changed it). */
export function GrossDifferenceCell({ summary }: { summary: Summary }) {
  if (summary.gross_override == null) return <span className="text-theme-muted/60">—</span>;
  const diff = Number(summary.gross_earned) - Number(summary.calculated_gross ?? summary.gross_earned);
  if (Math.abs(diff) < 0.005) return <span className="text-theme-muted">0.00</span>;
  return (
    <span className={`tabular-nums font-semibold ${diff > 0 ? 'text-emerald-accent' : 'text-danger'}`}>
      {diff > 0 ? '+' : '−'}{formatMoneyAmount(Math.abs(diff), summary.local_currency)}
    </span>
  );
}

/** Admin confirms this worker's final value has been checked. Editing it clears the confirmation. */
export function ConfirmFinalCell({ summary, locked, onSaved }: { summary: Summary; locked: boolean; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const confirmed = !!summary.final_confirmed_at;

  const toggle = async () => {
    setBusy(true);
    try {
      await api.post(`/payroll/summaries/${summary.id}/confirm-final`, { confirmed: !confirmed });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  // A green tick once checked; a red "NC" (not confirmed) until then. Click either to switch.
  if (confirmed) {
    const when = new Date(summary.final_confirmed_at as string).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return (
      <button
        type="button"
        disabled={busy || locked}
        onClick={() => void toggle()}
        title={`Confirmed by ${summary.final_confirmed_by_name ?? 'an admin'} on ${when}.${locked ? '' : ' Click to undo.'}`}
        aria-label="Confirmed"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20 disabled:opacity-60 disabled:hover:bg-emerald-accent/10"
      >
        <Check size={13} strokeWidth={3} />
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={busy || locked}
      onClick={() => void toggle()}
      title={locked ? 'Not confirmed' : 'Not confirmed. Click to mark this worker’s final value as checked.'}
      aria-label="Not confirmed"
      className="inline-flex h-6 min-w-[2rem] items-center justify-center rounded-full border border-danger/40 bg-danger/10 px-1.5 text-[10px] font-bold tracking-wide text-danger hover:bg-danger/20 disabled:opacity-60 disabled:hover:bg-danger/10"
    >
      {busy ? '…' : 'NC'}
    </button>
  );
}
