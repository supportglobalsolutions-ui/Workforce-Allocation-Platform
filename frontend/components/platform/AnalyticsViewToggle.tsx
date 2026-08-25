'use client';

import { BarChart3, LayoutGrid } from 'lucide-react';

export type AnalyticsView = 'cards' | 'charts';

interface AnalyticsViewToggleProps {
  value: AnalyticsView;
  onChange: (value: AnalyticsView) => void;
  className?: string;
}

export default function AnalyticsViewToggle({
  value,
  onChange,
  className = '',
}: AnalyticsViewToggleProps) {
  return (
    <div
      className={`inline-flex items-center rounded-xl border border-theme bg-brand-surface-low p-1 ${className}`}
      aria-label="Analytics display"
    >
      {([
        { key: 'cards' as const, label: 'Cards', icon: LayoutGrid },
        { key: 'charts' as const, label: 'Charts', icon: BarChart3 },
      ]).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
            value === key
              ? 'bg-emerald-accent text-slate-950 shadow-lg shadow-emerald-accent/15'
              : 'text-theme-muted hover:bg-brand-surface-high hover:text-theme-heading'
          }`}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}
