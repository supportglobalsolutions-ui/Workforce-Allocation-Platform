/**
 * Turns the plain text an admin typed into a training module into blocks a
 * learner can read.
 *
 * Training copy arrives as one string with hard line breaks wherever the
 * author's editor happened to wrap. Rendered with `whitespace-pre-wrap` those
 * become forced breaks, so sentences snap mid-clause. Here the text is
 * reflowed instead: only a blank line starts a new paragraph, and the shapes
 * authors reach for — a lead-in ending in a colon, "Term: explanation"
 * definitions, dashed lists — get the structure they were imitating.
 *
 * Deliberately not a markdown parser. The content is not markdown, and
 * treating it as such would mangle asterisks and underscores meant literally.
 */

export type ReadableBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'definition'; term: string; body: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

/** `- item`, `• item`, `* item`, `1. item`, `2) item`. */
const BULLET = /^\s*(?:[-–—*•]|\d+[.)])\s+/;

/**
 * "Scenario Adherence: Whether the user…" — a short capitalised term, then the
 * explanation. The term may carry no sentence punctuation, which is what stops
 * an ordinary sentence containing a colon from being mistaken for one.
 */
const DEFINITION = /^([A-Z][^:.!?\n]{1,45}):\s+(\S[\s\S]*)$/;

/** A lead-in like "The Dimensions:" that introduces what follows. */
function isHeading(text: string): boolean {
  return text.endsWith(':') && text.length <= 80 && !BULLET.test(text);
}

export function parseReadableText(raw: string): ReadableBlock[] {
  const chunks = raw.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const blocks: ReadableBlock[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;

    // Walk the chunk in runs so a paragraph followed by its bullets — all
    // inside one block of text — does not collapse into one or the other.
    let run: string[] = [];
    let runIsList = false;

    const flush = () => {
      if (run.length === 0) return;
      if (runIsList) {
        blocks.push({ kind: 'list', items: run.map((l) => l.replace(BULLET, '').trim()) });
      } else {
        // The join is the point: single newlines were the author's editor
        // wrapping, not a break they meant.
        const text = run.join(' ').replace(/\s+/g, ' ').trim();
        const definition = DEFINITION.exec(text);
        if (isHeading(text)) {
          blocks.push({ kind: 'heading', text: text.slice(0, -1) });
        } else if (definition) {
          blocks.push({
            kind: 'definition',
            term: definition[1].trim(),
            body: definition[2].trim(),
          });
        } else {
          blocks.push({ kind: 'paragraph', text });
        }
      }
      run = [];
    };

    for (const line of lines) {
      const isBullet = BULLET.test(line);
      if (run.length > 0 && isBullet !== runIsList) flush();
      runIsList = isBullet;
      run.push(line);
    }
    flush();
  }

  return blocks;
}
