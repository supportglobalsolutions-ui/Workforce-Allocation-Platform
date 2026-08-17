'use client';

import { ChevronDown } from 'lucide-react';

export interface PeriodFilterOption {
  id: string;
  label: string;
  start_date?: string;
  end_date?: string;
  status?: string;
}

const STATUS_CHIP: Record<string, string> = {
  open: 'bg-warning/15 text-warning border-warning/30',
  calculated: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  approved: 'bg-emerald-accent/15 text-emerald-accent border-emerald-accent/30',
  paid: 'bg-gold-accent/15 text-gold-accent border-gold-accent/30',
};

function StatusChip({ status }: { status: string }) {
  const cls = STATUS_CHIP[status] ?? 'bg-white/10 text-theme-muted border-white/20';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cls}`}>
      {status}
    </span>
  );
}

function formatRange(p: PeriodFilterOption): string {
  if (!p.start_date || !p.end_date) return p.label;
  const start = new Date(p.start_date).toLocaleDateString();
  const end = new Date(p.end_date).toLocaleDateString();
  return `${p.label} (${start} – ${end})`;
}

export default function PeriodFilter({
  periods,
  value,
  onChange,
  allowAll = false,
  allLabel = 'All',
  variant = 'select',
  label = 'Working month',
}: {
  periods: PeriodFilterOption[];
  value: string;
  onChange: (id: string) => void;
  allowAll?: boolean;
  allLabel?: string;
  variant?: 'select' | 'chips';
  label?: string;
}) {
  if (variant === 'chips') {
    return (
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-2">{label}</p>
        <div className="flex flex-wrap items-center gap-2">
          {allowAll && (
            <button
              type="button"
              onClick={() => onChange('')}
              className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                value === ''
                  ? 'border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent'
                  : 'border-white/10 text-theme-muted hover:text-theme-heading hover:border-emerald-accent/20'
              }`}
            >
              {allLabel}
            </button>
          )}
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                p.id === value
                  ? 'border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent'
                  : 'border-white/10 text-theme-muted hover:text-theme-heading hover:border-emerald-accent/20'
              }`}
            >
              {p.label}
              {p.status ? <StatusChip status={p.status} /> : null}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5">
      <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">{label}</label>
      <div className="relative w-full max-w-sm">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-field appearance-none pr-8"
          disabled={periods.length === 0 && !allowAll}
        >
          {allowAll && <option value="">{allLabel}</option>}
          {periods.length === 0 && !allowAll ? (
            <option value="">No periods available</option>
          ) : (
            periods.map((p) => (
              <option key={p.id} value={p.id}>
                {formatRange(p)}{p.status ? ` — ${p.status}` : ''}
              </option>
            ))
          )}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
      </div>
    </div>
  );
}
