'use client';

import { Search } from 'lucide-react';

interface FilterBarProps {
  singleRow?: boolean;
  searchPlaceholder?: string;
  filters?: { label: string; options: string[] }[];
  onSearch?: (value: string) => void;
  onFilterChange?: (label: string, value: string) => void;
  children?: React.ReactNode;
}

export default function FilterBar({
  singleRow = false,
  searchPlaceholder = 'Search...',
  filters = [],
  onSearch,
  onFilterChange,
  children,
}: FilterBarProps) {
  return (
    <div className={singleRow ? 'flex flex-nowrap items-center gap-3 mb-6 overflow-x-auto pb-1' : 'flex flex-col sm:flex-row gap-3 mb-6'}>
      <div className={singleRow ? 'relative flex-1 min-w-[12rem] max-w-md' : 'relative flex-1 max-w-md'}>
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
          className={`px-4 py-2.5 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40 ${singleRow ? 'w-auto shrink-0' : 'w-full sm:w-auto'}`}
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ))}
      {children}
    </div>
  );
}
