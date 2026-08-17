'use client';

import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';

import DeletePeriodModal from '@/components/payroll/DeletePeriodModal';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

interface Period {
  id: string;
  label: string;
}

interface Props {
  period: Period;
  onRenamed: (label: string) => void;
  onDeleted?: () => void;
  /** Rendered next to the name when not editing (e.g. a status chip). */
  trailing?: React.ReactNode;
  size?: 'sm' | 'lg';
}

/**
 * Work period names are generated from the start month, but a month can hold
 * more than one period, so admins can rename them. Names stay globally unique;
 * the API answers 409 on a clash.
 */
export default function PeriodNameEditor({ period, onRenamed, onDeleted, trailing, size = 'sm' }: Props) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(period.label);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const large = size === 'lg';

  async function save() {
    const next = label.trim();
    if (!next || next === period.label) { setEditing(false); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch<Period>(`/payroll/periods/${period.id}`, { label: next });
      onRenamed(updated.label);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename this period.');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span className={`inline-flex items-center gap-2 ${large ? 'flex-wrap justify-center' : ''}`}>
        <span className={large
          ? 'text-xl sm:text-2xl font-black text-theme-heading tracking-tight'
          : 'text-xs font-bold text-theme-heading'}>
          {period.label}
        </span>
        <button
          type="button"
          onClick={() => { setLabel(period.label); setError(null); setEditing(true); }}
          title="Rename this work period"
          className={`inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5 transition-colors ${
            large ? 'w-7 h-7' : 'w-6 h-6'
          }`}
        >
          <Pencil size={large ? 13 : 11} />
        </button>
        {trailing}
      </span>
    );
  }

  return (
    <span className={large ? 'block' : 'inline-block'}>
      <span className={`inline-flex items-center gap-1.5 ${large ? 'justify-center' : ''}`}>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') setEditing(false);
          }}
          className={`input-field !py-1 !px-2 ${large ? 'w-64 text-base text-center' : 'w-52 text-xs'}`}
        />
        <button type="button" onClick={save} disabled={saving} title="Save name"
          className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-emerald-accent hover:bg-emerald-accent/10 disabled:opacity-40">
          {saving ? <SpinningDots size="sm" /> : <Check size={13} />}
        </button>
        <button type="button" onClick={() => setEditing(false)} title="Cancel"
          className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading">
          <X size={13} />
        </button>
      </span>
      {error && <p className={`text-[10px] text-danger mt-1 ${large ? 'text-center' : ''}`}>{error}</p>}
      {onDeleted && (
        <button
          type="button"
          onClick={() => setDeleting(true)}
          className={`mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-danger hover:underline ${large ? 'mx-auto' : ''}`}
        >
          <Trash2 size={11} /> Delete this work period
        </button>
      )}
      {deleting && onDeleted && (
        <DeletePeriodModal
          period={period}
          onClose={() => setDeleting(false)}
          onDeleted={() => { setDeleting(false); setEditing(false); onDeleted(); }}
        />
      )}
    </span>
  );
}
