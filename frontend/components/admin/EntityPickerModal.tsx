'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, X } from 'lucide-react';

export interface PickerOption {
  id: string;
  /** Primary line — what the search matches first. */
  label: string;
  /** Secondary line: username, platform, owner… also searchable. */
  hint?: string;
}

interface BaseProps {
  open: boolean;
  title: string;
  /** One line under the title explaining what the choice controls. */
  description?: string;
  options: PickerOption[];
  searchPlaceholder?: string;
  emptyLabel?: string;
  onClose: () => void;
}

interface SingleProps extends BaseProps {
  multiple?: false;
  /** Selected id, or '' for none. */
  value: string;
  onSave: (value: string) => void;
  /** Label for the "no selection" row. Omit to require a choice. */
  noneLabel?: string;
}

interface MultiProps extends BaseProps {
  multiple: true;
  value: string[];
  onSave: (value: string[]) => void;
}

type Props = SingleProps | MultiProps;

function matches(option: PickerOption, needle: string): boolean {
  if (!needle) return true;
  const q = needle.toLowerCase();
  return (
    option.label.toLowerCase().includes(q)
    || (option.hint ?? '').toLowerCase().includes(q)
  );
}

/**
 * Full modal for picking one or many records.
 *
 * Replaces the inline dropdown this page used to render: that popover was
 * clipped by the surrounding modal, had no search, and committed each click
 * straight to the form. Choices here are staged and only applied on Save, so
 * Cancel genuinely reverts.
 */
export default function EntityPickerModal(props: Props) {
  const {
    open, title, description, options, searchPlaceholder, emptyLabel, onClose,
  } = props;
  const multiple = props.multiple === true;

  const [query, setQuery] = useState('');
  const [singleDraft, setSingleDraft] = useState('');
  const [multiDraft, setMultiDraft] = useState<string[]>([]);

  // Re-stage from the committed value every time the modal opens, so a
  // cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    if (props.multiple === true) setMultiDraft([...props.value]);
    else setSingleDraft(props.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const visible = useMemo(
    () => options.filter((o) => matches(o, query.trim())),
    [options, query],
  );

  if (!open || typeof document === 'undefined') return null;

  const selectedCount = multiple ? multiDraft.length : (singleDraft ? 1 : 0);
  /** Select all / Deselect all act on what the search is showing. */
  const visibleIds = visible.map((o) => o.id);
  const allVisibleChosen = visibleIds.length > 0
    && visibleIds.every((id) => multiDraft.includes(id));

  const toggle = (id: string) => {
    if (props.multiple === true) {
      setMultiDraft((prev) => (
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      ));
    } else {
      setSingleDraft(id);
    }
  };

  const save = () => {
    if (props.multiple === true) props.onSave(multiDraft);
    else props.onSave(singleDraft);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="glass-modal relative z-10 w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-theme shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-theme-heading truncate">{title}</h2>
            {description && (
              <p className="text-xs text-theme-muted mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:bg-white/5 hover:text-theme-heading"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 pt-4 pb-3 shrink-0 space-y-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder ?? 'Search…'}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 py-2.5 text-sm text-theme-heading placeholder:text-theme-muted focus:outline-none focus:border-emerald-accent/40"
            />
          </div>

          {multiple && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-theme-muted">
                {selectedCount} selected
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={visibleIds.length === 0 || allVisibleChosen}
                  onClick={() => setMultiDraft((prev) => (
                    Array.from(new Set([...prev, ...visibleIds]))
                  ))}
                  className="text-xs font-semibold text-emerald-accent hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  Select all
                </button>
                <button
                  type="button"
                  disabled={selectedCount === 0}
                  onClick={() => setMultiDraft((prev) => prev.filter((id) => !visibleIds.includes(id)))}
                  className="text-xs font-semibold text-theme-muted hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  Deselect all
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">
          {!multiple && props.noneLabel && (
            <button
              type="button"
              onClick={() => setSingleDraft('')}
              className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                singleDraft === ''
                  ? 'bg-emerald-accent/15 text-emerald-accent'
                  : 'text-theme-body hover:bg-white/5'
              }`}
            >
              <span className="truncate">{props.noneLabel}</span>
              {singleDraft === '' && <Check size={15} className="shrink-0" />}
            </button>
          )}

          {visible.length === 0 ? (
            <p className="text-sm text-theme-muted px-3 py-6 text-center">
              {query.trim()
                ? `Nothing matches “${query.trim()}”.`
                : (emptyLabel ?? 'Nothing to choose from.')}
            </p>
          ) : (
            visible.map((o) => {
              const chosen = multiple ? multiDraft.includes(o.id) : singleDraft === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    chosen && !multiple
                      ? 'bg-emerald-accent/15'
                      : 'hover:bg-white/5'
                  }`}
                >
                  {multiple && (
                    <span
                      aria-hidden
                      className={`shrink-0 h-4 w-4 rounded border flex items-center justify-center ${
                        chosen
                          ? 'bg-emerald-accent border-emerald-accent text-[#06231b]'
                          : 'border-white/25'
                      }`}
                    >
                      {chosen && <Check size={11} strokeWidth={3} />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm truncate ${chosen ? 'text-theme-heading font-medium' : 'text-theme-body'}`}>
                      {o.label}
                    </span>
                    {o.hint && (
                      <span className="block text-[11px] text-theme-muted truncate">{o.hint}</span>
                    )}
                  </span>
                  {chosen && !multiple && (
                    <Check size={15} className="shrink-0 text-emerald-accent" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-4 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">
            Cancel
          </button>
          <button type="button" onClick={save} className="btn-primary text-sm py-2 px-4">
            Save selection
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
