'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export default function FinanceMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return <div ref={root} className="relative shrink-0">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
      className="btn-secondary text-xs px-3 py-2 inline-flex items-center gap-2">
      {label}<ChevronDown size={13} />
    </button>
    {open && <div className="absolute right-0 top-full mt-2 z-40 w-64 rounded-xl border border-theme bg-brand-card p-2 shadow-xl flex flex-col gap-1 [&>button]:w-full [&>button]:justify-start [&>a]:w-full"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('[data-menu-keep-open]')) return;
        const button = (event.target as HTMLElement).closest('button, a');
        if (button && !button.hasAttribute('disabled')) setOpen(false);
      }}>
      {children}
    </div>}
  </div>;
}
