'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export type SplitMode = 'equal' | 'percent';

export interface RecipientOption {
  id: string;
  name: string;
  sub?: string;
  /** Short status pill, e.g. "Unapproved". */
  badge?: { label: string; tone: 'ok' | 'warn' | 'muted' };
}

interface Props {
  title: string;
  items: RecipientOption[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  mode: SplitMode;
  onModeChange: (mode: SplitMode) => void;
  pcts: Record<string, string>;
  onPctsChange: (next: Record<string, string>) => void;
  /** Extra quick-select buttons, e.g. "Approved only". */
  quickSelects?: { label: string; ids: string[] }[];
  emptyText?: string;
}

const BADGE_TONE: Record<'ok' | 'warn' | 'muted', string> = {
  ok: 'text-emerald-accent border-emerald-accent/30 bg-emerald-accent/10',
  warn: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  muted: 'text-theme-muted border-white/10',
};

/** Checkbox list with "all / selected" and an equal-or-percent split per recipient. */
export default function RecipientPicker({
  title,
  items,
  selected,
  onSelectedChange,
  mode,
  onModeChange,
  pcts,
  onPctsChange,
  quickSelects = [],
  emptyText = 'Nothing to pick from.',
}: Props) {
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sub || '').toLowerCase().includes(q));
  }, [items, search]);

  const pctTotal = useMemo(
    () => Array.from(selected).reduce((sum, id) => sum + (Number(pcts[id]) || 0), 0),
    [selected, pcts],
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));
  const toggleVisible = () => {
    const next = new Set(selected);
    if (allVisibleSelected) visible.forEach((i) => next.delete(i.id));
    else visible.forEach((i) => next.add(i.id));
    onSelectedChange(next);
  };

  const spreadEvenly = () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const each = Math.floor((10000 / ids.length)) / 100;
    const next: Record<string, string> = { ...pcts };
    ids.forEach((id, i) => {
      // Last one takes the rounding remainder so the column adds to 100.
      next[id] = i === ids.length - 1 ? (100 - each * (ids.length - 1)).toFixed(2) : each.toFixed(2);
    });
    onPctsChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-theme-muted">
          {title} <span className="text-theme-heading">({selected.size} selected)</span>
        </h3>
        <div className="flex gap-1 p-0.5 rounded-lg border border-white/10">
          {(['equal', 'percent'] as SplitMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`text-[11px] px-2.5 py-1 rounded-md font-semibold ${
                mode === m ? 'bg-emerald-accent/20 text-emerald-accent' : 'text-theme-muted'
              }`}
            >
              {m === 'equal' ? 'Equal per head' : '% each'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="input-field pl-9 w-full"
          />
        </div>
        {quickSelects.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => onSelectedChange(new Set(q.ids))}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            {q.label} ({q.ids.length})
          </button>
        ))}
        <button type="button" onClick={() => onSelectedChange(new Set())} className="btn-secondary text-xs py-1.5 px-3">
          Clear
        </button>
        {mode === 'percent' && (
          <button type="button" onClick={spreadEvenly} className="btn-secondary text-xs py-1.5 px-3">
            Spread % evenly
          </button>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-brand-surface-lowest">
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-2 text-left w-8">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label="Select all shown" />
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-theme-muted">Name</th>
              {mode === 'percent' && (
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-theme-muted w-28">%</th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-theme-muted text-xs">{emptyText}</td>
              </tr>
            ) : visible.map((item) => (
              <tr key={item.id} className="border-b border-white/[0.04] last:border-0">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} aria-label={item.name} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-theme-heading">{item.name}</span>
                    {item.badge && (
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${BADGE_TONE[item.badge.tone]}`}>
                        {item.badge.label}
                      </span>
                    )}
                  </div>
                  {item.sub && <div className="text-[11px] text-theme-muted">{item.sub}</div>}
                </td>
                {mode === 'percent' && (
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      disabled={!selected.has(item.id)}
                      value={selected.has(item.id) ? (pcts[item.id] ?? '') : ''}
                      onChange={(e) => onPctsChange({ ...pcts, [item.id]: e.target.value })}
                      className="input-field w-24 text-right py-1"
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode === 'percent' && selected.size > 0 && (
        <p className={`text-xs ${Math.abs(pctTotal - 100) < 0.01 ? 'text-emerald-accent' : 'text-amber-400'}`}>
          Percentages add up to {pctTotal.toFixed(2)}% {Math.abs(pctTotal - 100) < 0.01 ? '✓' : '(must be 100%)'}
        </p>
      )}
    </div>
  );
}

/** Selected ids → `{id: number}` for the API; undefined in equal mode. */
export function pctPayload(mode: SplitMode, selected: Set<string>, pcts: Record<string, string>) {
  if (mode !== 'percent') return undefined;
  const out: Record<string, number> = {};
  selected.forEach((id) => { out[id] = Number(pcts[id]) || 0; });
  return out;
}
