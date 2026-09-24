'use client';

import { useEffect, useRef } from 'react';
import { Bold, List } from 'lucide-react';

/**
 * Small HTML subset editor for assessment briefing fields.
 * Toolbar: Bold + Bulleted list. Value is HTML (`<p>`, `<strong>`, `<ul>/<li>`, `<br>`).
 */
export default function FormattedTextField({
  value,
  onChange,
  placeholder = '',
  minHeightClass = 'min-h-[6rem]',
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || '';
    }
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    onChange(el.innerHTML);
  }

  function run(command: string) {
    ref.current?.focus();
    document.execCommand(command, false);
    emit();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-brand-surface-high overflow-hidden focus-within:border-emerald-accent/50">
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-2 py-1.5 bg-white/[0.02]">
        <button
          type="button"
          title="Bold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run('bold')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5"
        >
          <Bold size={14} />
        </button>
        <button
          type="button"
          title="Bulleted list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run('insertUnorderedList')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5"
        >
          <List size={14} />
        </button>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        className={[
          'px-3 py-2 text-sm text-white outline-none',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-theme-muted',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5',
          '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5',
          '[&_strong]:font-bold [&_b]:font-bold',
          '[&_p]:my-1',
          minHeightClass,
        ].join(' ')}
      />
    </div>
  );
}

/** Safe display of the same HTML subset used by FormattedTextField. */
export function FormattedTextView({
  html,
  className = '',
}: {
  html: string;
  className?: string;
}) {
  const cleaned = sanitizeBriefingHtml(html);
  if (!cleaned) return null;
  return (
    <div
      className={[
        'text-sm text-white/90 leading-relaxed',
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5',
        '[&_strong]:font-bold [&_b]:font-bold',
        '[&_p]:my-1',
        className,
      ].join(' ')}
      dangerouslySetInnerHTML={{ __html: cleaned }}
    />
  );
}

/** Strip tags for required-field checks. */
export function briefingPlainText(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The only tags that survive sanitising — the subset the toolbar can produce,
 * plus the `div` contentEditable wraps lines in (unwrapping those would run
 * every line together). Uppercase because that is what `tagName` returns.
 * Anything else is unwrapped, keeping its text but losing the element.
 */
const ALLOWED_TAGS = new Set(['P', 'BR', 'DIV', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI']);

/** Strip scripts/attrs; keep bold + lists only. */
export function sanitizeBriefingHtml(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  if (typeof document === 'undefined') {
    return raw
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '')
      .replace(/\son\w+='[^']*'/gi, '');
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = raw;
  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (!ALLOWED_TAGS.has(el.tagName)) {
        const parent = el.parentNode;
        while (el.firstChild) parent?.insertBefore(el.firstChild, el);
        parent?.removeChild(el);
        return;
      }
      [...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
    }
    [...node.childNodes].forEach(walk);
  };
  [...wrap.childNodes].forEach(walk);
  return wrap.innerHTML.trim();
}
