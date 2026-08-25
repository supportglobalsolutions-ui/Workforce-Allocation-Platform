'use client';

import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { overlappingPeriods, type PeriodLike } from '@/lib/periods';

interface Period extends PeriodLike {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface Props {
  period: Period;
  allPeriods: Period[];
  onSaved: (dates: { start_date: string; end_date: string }) => void;
}

function isoDay(d: string): string {
  return d.slice(0, 10);
}

export default function PeriodDatesEditor({ period, allPeriods, onSaved }: Props) {
  const locked = period.status === 'approved' || period.status === 'paid';
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(isoDay(period.start_date));
  const [end, setEnd] = useState(isoDay(period.end_date));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = { ...period, start_date: start, end_date: end };
  const overlaps = overlappingPeriods(preview, allPeriods);

  async function save() {
    if (start === isoDay(period.start_date) && end === isoDay(period.end_date)) {
      setEditing(false);
      return;
    }
    if (end < start) {
      setError('End date must be on or after the start date.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch<Period>(`/payroll/periods/${period.id}`, {
        start_date: start,
        end_date: end,
      });
      onSaved({ start_date: updated.start_date, end_date: updated.end_date });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update dates.');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const viewOverlaps = overlappingPeriods(period, allPeriods);
    return (
      <span className="block">
        <span className="inline-flex items-center gap-1.5 flex-wrap justify-center">
          <span className="text-sm text-theme-muted">
            {new Date(isoDay(period.start_date) + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            {' → '}
            {new Date(isoDay(period.end_date) + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          {!locked && (
            <button
              type="button"
              onClick={() => {
                setStart(isoDay(period.start_date));
                setEnd(isoDay(period.end_date));
                setError(null);
                setEditing(true);
              }}
              title="Edit dates"
              className="w-6 h-6 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5"
            >
              <Pencil size={11} />
            </button>
          )}
        </span>
        {viewOverlaps.length > 0 && (
          <p className="text-[11px] text-gold-accent mt-1">
            Overlaps {viewOverlaps.map((p) => p.label).join(', ')} — allowed for a bonus or correction run.
          </p>
        )}
      </span>
    );
  }

  return (
    <span className="block">
      <span className="inline-flex items-end gap-2 flex-wrap justify-center">
        <label className="text-left">
          <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted block mb-1">Start</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input-field !py-1.5 !px-2 text-sm" />
        </label>
        <label className="text-left">
          <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted block mb-1">End</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input-field !py-1.5 !px-2 text-sm" />
        </label>
        <button type="button" disabled={saving} onClick={() => void save()}
          className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-emerald-accent hover:bg-emerald-accent/10 disabled:opacity-40">
          {saving ? <SpinningDots size="sm" /> : <Check size={13} />}
        </button>
        <button type="button" onClick={() => setEditing(false)}
          className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading">
          <X size={13} />
        </button>
      </span>
      {period.status === 'calculated' && (
        <p className="text-[11px] text-warning mt-1">Changing dates does not move payslip rows already stored on this period.</p>
      )}
      {overlaps.length > 0 && (
        <p className="text-[11px] text-gold-accent mt-1">
          Overlaps {overlaps.map((p) => p.label).join(', ')} — allowed for a bonus or correction run.
        </p>
      )}
      {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
    </span>
  );
}
