'use client';

import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

/**
 * A table value with a pencil: click it to edit in place, Enter or ✓ to save,
 * Esc or ✗ to cancel. Same look as the Final gross cell.
 */
export default function EditableCell({
  display,
  value,
  onSave,
  locked = false,
  type = 'number',
  align = 'right',
  label,
  hint,
  inputWidth = 'w-24',
}: {
  /** What the cell shows when not editing. */
  display: React.ReactNode;
  /** The raw value the input starts from. */
  value: string;
  /** Persist the typed value ('' means blank). Throw to show an error. */
  onSave: (value: string) => Promise<void>;
  locked?: boolean;
  type?: 'number' | 'text' | 'date';
  align?: 'right' | 'left';
  label: string;
  hint?: string;
  inputWidth?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const justify = align === 'right' ? 'justify-end' : 'justify-start';

  const save = async () => {
    if (type === 'number' && draft.trim() !== '' && !Number.isFinite(Number(draft))) {
      setError('Enter a number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className={`flex items-center ${justify} gap-1`}>
        <input
          type={type}
          step={type === 'number' ? 'any' : undefined}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') setEditing(false);
          }}
          className={`${inputWidth} rounded-md border border-emerald-accent/40 bg-brand-surface-high px-2 py-1 text-sm text-white ${align === 'right' ? 'text-right' : ''}`}
          aria-label={label}
        />
        <button type="button" disabled={busy} onClick={() => void save()}
          className="rounded-md p-1 text-emerald-accent hover:bg-emerald-accent/10 disabled:opacity-40" aria-label={`Save ${label}`}>
          <Check size={14} />
        </button>
        <button type="button" onClick={() => setEditing(false)}
          className="rounded-md p-1 text-theme-muted hover:text-theme-heading" aria-label="Cancel">
          <X size={14} />
        </button>
        {error && <span className="text-[10px] text-danger whitespace-nowrap">{error}</span>}
      </div>
    );
  }

  if (locked) {
    return <div className={`flex items-center ${justify}`}><span className="min-w-0">{display}</span></div>;
  }

  const start = () => { setDraft(value); setError(null); setEditing(true); };

  // The pencil only shows on hover (or keyboard focus); clicking the value edits too.
  return (
    <div className={`group flex items-center ${justify} gap-1.5`}>
      <span className="min-w-0 cursor-text" onClick={start} title={hint ?? `Click to edit ${label}`}>{display}</span>
      <button
        type="button"
        onClick={start}
        title={hint ?? `Edit ${label}`}
        className="shrink-0 rounded-md p-1 text-theme-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-emerald-accent hover:bg-emerald-accent/10"
        aria-label={`Edit ${label}`}
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}
