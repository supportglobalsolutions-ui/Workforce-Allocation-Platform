'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react';

import { useAuth } from '@/lib/auth/AuthProvider';
import type { PortalRole } from '@/lib/navigation/config';
import {
  filterSearchResults,
  getSearchablePages,
  type SearchResult,
} from '@/lib/navigation/search';

interface PageSearchModalProps {
  open: boolean;
  onClose: () => void;
}

function portalBadgeClass(portal: PortalRole): string {
  switch (portal) {
    case 'worker':
      return 'bg-brand-tertiary/15 text-brand-tertiary border-brand-tertiary/25';
    case 'admin':
      return 'bg-emerald-accent/12 text-emerald-accent border-emerald-accent/25';
    case 'leadership':
      return 'bg-gold-accent/12 text-gold-accent border-gold-accent/30';
  }
}

export default function PageSearchModal({ open, onClose }: PageSearchModalProps) {
  const router = useRouter();
  const { session } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const allPages = useMemo(
    () => (session ? getSearchablePages(session) : []),
    [session],
  );

  const hasQuery = query.trim().length > 0;

  const results = useMemo(
    () => (hasQuery ? filterSearchResults(allPages, query) : []),
    [allPages, query, hasQuery],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    document.body.classList.add('nav-scroll-lock');
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      window.clearTimeout(t);
      document.body.classList.remove('nav-scroll-lock');
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open || !hasQuery) return;
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, hasQuery]);

  const goTo = useCallback(
    (row: SearchResult) => {
      onClose();
      router.push(row.href);
    },
    [onClose, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      goTo(results[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close search"
            className="modal-overlay fixed inset-0 z-[200] cursor-default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search pages"
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
            initial={{ opacity: 0, y: -16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <div className="glass-modal w-full max-w-[44rem] overflow-hidden pointer-events-auto bg-brand-card">
              {/* Emerald + gold accent strip */}
              <div className="h-1 w-full bg-gradient-to-r from-emerald-accent via-emerald-accent/70 to-gold-accent" />

              <div className="flex items-center gap-3 px-4 py-4 border-b border-theme bg-brand-surface-low">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-accent/12 border border-emerald-accent/20">
                  <Search size={18} className="text-emerald-accent" />
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search pages — payroll, sessions, quality…"
                  className="flex-1 bg-brand-surface-container border border-theme rounded-xl px-3 py-2.5 text-base text-theme-heading placeholder:text-theme-muted focus:outline-none focus:border-emerald-accent/40 focus:ring-1 focus:ring-emerald-accent/20 transition-colors"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              <div
                ref={listRef}
                className={`overflow-y-auto bg-brand-card transition-[min-height] duration-200 ${
                  hasQuery ? 'min-h-[12rem] max-h-[min(58vh,28rem)]' : 'min-h-[10rem]'
                }`}
              >
                {!hasQuery ? (
                  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-accent/15 to-gold-accent/10 border border-emerald-accent/20 mb-4">
                      <Search size={26} className="text-emerald-accent" strokeWidth={1.75} />
                    </span>
                    <p className="text-sm font-semibold text-theme-heading">Start typing to search</p>
                    <p className="text-xs text-theme-muted mt-1.5 max-w-xs leading-relaxed">
                      Only pages you can access for your role will appear.
                    </p>
                  </div>
                ) : results.length === 0 ? (
                  <p className="px-6 py-14 text-sm text-theme-muted text-center">
                    No pages match &ldquo;{query.trim()}&rdquo;.
                  </p>
                ) : (
                  <div className="py-1.5">
                    {results.map((row, i) => (
                      <button
                        key={row.id}
                        type="button"
                        data-index={i}
                        onClick={() => goTo(row)}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors border-l-2 ${
                          i === activeIndex
                            ? 'bg-emerald-accent/10 border-emerald-accent'
                            : 'border-transparent hover:bg-brand-surface-high/80'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-semibold text-theme-heading">{row.title}</span>
                            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${portalBadgeClass(row.portal)}`}>
                              {row.portalLabel}
                            </span>
                          </div>
                          {row.description ? (
                            <p className="text-sm text-theme-muted mt-1 line-clamp-2 leading-relaxed">{row.description}</p>
                          ) : null}
                          <p className="text-[11px] font-mono text-emerald-accent/60 mt-1.5 truncate">{row.href}</p>
                        </div>
                        <ArrowRight
                          size={16}
                          className={`shrink-0 mt-1 transition-all ${i === activeIndex ? 'text-emerald-accent opacity-100 translate-x-0' : 'opacity-0 -translate-x-1'}`}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-theme bg-brand-surface-low flex items-center gap-4 text-[11px] text-theme-muted">
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded-md bg-brand-surface-high border border-theme font-mono text-[10px] text-theme-heading">↑↓</kbd>
                  navigate
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CornerDownLeft size={11} className="text-emerald-accent" />
                  open
                </span>
                <span className="inline-flex items-center gap-1.5 ml-auto">
                  <kbd className="px-1.5 py-0.5 rounded-md bg-brand-surface-high border border-theme font-mono text-[10px] text-theme-heading">esc</kbd>
                  to close
                </span>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/** Register Cmd/Ctrl+K to open search from portal shells. */
export function usePageSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen]);
}
