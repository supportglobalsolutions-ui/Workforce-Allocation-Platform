'use client';

import { useMemo } from 'react';

import { parseReadableText } from '@/lib/readable-text';

interface ReadableTextProps {
  text: string;
  /**
   * Caps the line length. Much past ~70 characters and the reader loses their
   * place on the return sweep, which is the whole problem with running
   * training copy the full width of a wide screen.
   */
  measure?: string;
  className?: string;
}

/**
 * Renders training copy as something a learner can actually read — reflowed
 * paragraphs, real headings, bolded definition terms, proper lists. The
 * parsing lives in `lib/readable-text.ts`; this is only the presentation.
 */
export default function ReadableText({
  text,
  measure = 'max-w-[68ch]',
  className = '',
}: ReadableTextProps) {
  const blocks = useMemo(() => parseReadableText(text), [text]);

  if (blocks.length === 0) return null;

  return (
    // Sizes are in em so the reader's text-size control scales everything in
    // here together, headings and body alike.
    <div className={`${measure} space-y-[1.1em] text-[1em] leading-[1.75] text-theme-body ${className}`}>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return (
              <h4
                key={i}
                className="pt-[0.6em] text-[1.06em] font-bold tracking-tight text-theme-heading"
              >
                {block.text}
              </h4>
            );

          case 'definition':
            return (
              <p key={i}>
                <strong className="font-semibold text-theme-heading">{block.term}</strong>
                <span className="text-theme-muted">: </span>
                {block.body}
              </p>
            );

          case 'list':
            return (
              <ul key={i} className="list-disc space-y-[0.5em] pl-[1.4em] marker:text-emerald-accent">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );

          default:
            return <p key={i}>{block.text}</p>;
        }
      })}
    </div>
  );
}
