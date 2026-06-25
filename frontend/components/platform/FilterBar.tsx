'use client';

import { Search } from 'lucide-react';

interface FilterBarProps {
  searchPlaceholder?: string;
  filters?: { label: string; options: string[] }[];
  onSearch?: (value: string) => void;
  onFilterChange?: (label: string, value: string) => void;
}

export default function FilterBar({
  searchPlaceholder = 'Search...',
  filters = [],
  onSearch,
  onFilterChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <div className="relative flex-1 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          onChange={(e) => onSearch?.(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white placeholder:text-brand-on-surface-variant/60 focus:outline-none focus:border-emerald-accent/40 transition-colors"
        />
      </div>
      {filters.map((f) => (
        <select
          key={f.label}
          onChange={(e) => onFilterChange?.(f.label, e.target.value)}
          className="px-4 py-2.5 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40"
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
