'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';

/** Big, clearly visible left/right buttons that scroll a horizontal area. */
export function ScrollArrows({ target, label, step = 450 }: {
  target: RefObject<HTMLElement | null>;
  label: string;
  step?: number;
}) {
  const btn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent shadow-sm transition-colors hover:bg-emerald-accent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-accent';
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label={`Scroll ${label} left`} title={`Scroll ${label} left`} className={btn}
        onClick={() => target.current?.scrollBy({ left: -step, behavior: 'smooth' })}>
        <ChevronLeft size={20} strokeWidth={2.5} />
      </button>
      <button type="button" aria-label={`Scroll ${label} right`} title={`Scroll ${label} right`} className={btn}
        onClick={() => target.current?.scrollBy({ left: step, behavior: 'smooth' })}>
        <ChevronRight size={20} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/**
 * The totals cards row with a hide/show arrow and scroll arrows.
 * Whether it is open is remembered per page in this browser.
 */
export function LedgerKpis({ storageKey, label = 'Totals', children }: {
  storageKey: string;
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const scroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === 'hidden') setOpen(false);
    } catch { /* storage unavailable: stay open */ }
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      try { window.localStorage.setItem(storageKey, prev ? 'hidden' : 'shown'); } catch { /* ignore */ }
      return !prev;
    });
  };

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={toggle} aria-expanded={open}
          title={open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-theme-heading hover:border-emerald-accent/40 hover:text-emerald-accent">
          {open ? <ChevronUp size={16} strokeWidth={2.5} /> : <ChevronDown size={16} strokeWidth={2.5} />}
          {label}
        </button>
        {open && <ScrollArrows target={scroll} label={label.toLowerCase()} step={350} />}
      </div>
      {open && (
        <div ref={scroll} className="ledger-kpi-scroll flex gap-3 overflow-x-auto pb-2" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}
