'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Marks a session an admin added by hand rather than one the worker logged:
 * a green "!" that says "Added by admin" when clicked.
 */
export default function AdminAddedBadge() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (ev: MouseEvent) => { if (!ref.current?.contains(ev.target as Node)) setOpen(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex w-fit">
      <button type="button" aria-label="Added by admin" aria-expanded={open} title="Added by admin"
        onClick={(ev) => { ev.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black leading-none text-white hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
        !
      </button>
      {open && (
        <span role="status"
          className="absolute left-full top-1/2 z-20 ml-1.5 -translate-y-1/2 whitespace-nowrap rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 shadow-sm backdrop-blur">
          Added by admin
        </span>
      )}
    </span>
  );
}
