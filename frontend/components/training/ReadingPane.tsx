'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Type } from 'lucide-react';

/**
 * A panel of training content the learner can blow up to the whole screen.
 *
 * Two controls, both aimed at the same thing — a long module brief read on
 * whatever machine the worker has. Full screen drops the sidebar, header and
 * neighbouring cards so only the words are left; the text-size step survives
 * in localStorage, because someone who needs larger text needs it on every
 * lesson, not just the one where they asked.
 *
 * The body keeps a comfortable measure in both modes. Full screen means more
 * room around the column, never longer lines.
 */

const SIZES = [15, 17, 19, 21] as const;
const DEFAULT_SIZE_INDEX = 1;
const STORAGE_KEY = 'training-reader-size';

interface ReadingPaneProps {
  title: string;
  /** Chip or icon shown next to the title. */
  badge?: ReactNode;
  /** Pinned below the content — the mark-complete row, typically. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function ReadingPane({
  title,
  badge,
  footer,
  children,
  className = '',
}: ReadingPaneProps) {
  const [mounted, setMounted] = useState(false);
  const [focused, setFocused] = useState(false);
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE_INDEX);

  useEffect(() => {
    setMounted(true);
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isInteger(stored) && stored >= 0 && stored < SIZES.length) {
      setSizeIndex(stored);
    }
  }, []);

  const setSize = (next: number) => {
    const clamped = Math.min(SIZES.length - 1, Math.max(0, next));
    setSizeIndex(clamped);
    window.localStorage.setItem(STORAGE_KEY, String(clamped));
  };

  // Escape is the way out of anything that covers the screen.
  useEffect(() => {
    if (!focused) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocused(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [focused]);

  const fontSize = `${SIZES[sizeIndex]}px`;

  const controls = (
    <div className="flex shrink-0 items-center gap-1">
      <div
        className="mr-1 flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] px-1 py-0.5"
        role="group"
        aria-label="Text size"
      >
        <Type size={12} className="mx-1 text-theme-muted" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setSize(sizeIndex - 1)}
          disabled={sizeIndex === 0}
          aria-label="Smaller text"
          className="rounded px-1.5 text-xs font-bold text-theme-muted hover:text-white disabled:opacity-30"
        >
          A−
        </button>
        <button
          type="button"
          onClick={() => setSize(sizeIndex + 1)}
          disabled={sizeIndex === SIZES.length - 1}
          aria-label="Larger text"
          className="rounded px-1.5 text-sm font-bold text-theme-muted hover:text-white disabled:opacity-30"
        >
          A+
        </button>
      </div>

      <button
        type="button"
        onClick={() => setFocused((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-theme-muted transition-colors hover:border-emerald-accent/30 hover:text-emerald-accent"
      >
        {focused ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        {focused ? 'Exit full screen' : 'Full screen'}
      </button>
    </div>
  );

  if (focused && mounted) {
    return createPortal(
      <div className="fixed inset-0 z-[120] flex flex-col bg-brand-background">
        <header className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-4 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-sm font-bold text-theme-heading">{title}</h2>
            {badge}
          </div>
          {controls}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-8 sm:py-12">
          <div className="mx-auto w-full max-w-3xl" style={{ fontSize }}>
            {children}
          </div>
        </div>

        {footer && (
          <div className="border-t border-white/[0.08] px-4 py-4 sm:px-8">
            <div className="mx-auto w-full max-w-3xl">{footer}</div>
          </div>
        )}

        <p className="pb-3 text-center text-[10px] uppercase tracking-wider text-theme-muted">
          Press Esc to leave full screen
        </p>
      </div>,
      document.body,
    );
  }

  return (
    <section className={`glass-panel flex flex-col rounded-2xl ${className}`}>
      <header className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <h3 className="truncate text-sm font-bold text-theme-heading">{title}</h3>
          {badge}
        </div>
        {controls}
      </header>

      <div className="flex-1 px-5 py-5" style={{ fontSize }}>
        {children}
      </div>

      {footer && <div className="border-t border-white/[0.06] px-5 py-4">{footer}</div>}
    </section>
  );
}
