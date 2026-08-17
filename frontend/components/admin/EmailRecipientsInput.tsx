'use client';

import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

/** Mirrors backend services/email_resend.py so bad addresses are caught before the request. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const BLOCKED_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'test.com', 'invalid', 'localhost']);

export function isValidRecipient(email: string): boolean {
  return rejectionReason(email) === null;
}

export function rejectionReason(email: string): string | null {
  const addr = email.trim();
  if (!EMAIL_RE.test(addr)) return `“${addr}” is not a full email address.`;
  const domain = addr.split('@').pop()!.toLowerCase();
  if (BLOCKED_DOMAINS.has(domain) || domain.endsWith('.example')) {
    return `@${domain} is rejected by the mail provider — use a real inbox.`;
  }
  return null;
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  hint?: React.ReactNode;
  placeholder?: string;
}

/**
 * Chip-style input for one or many typed recipients. Commits on Enter, Tab, comma
 * or blur, and splits pasted lists on commas, semicolons and newlines.
 */
export default function EmailRecipientsInput({
  value, onChange, label = 'Additional recipients', hint, placeholder = 'name@company.com',
}: Props) {
  const [draft, setDraft] = useState('');
  const [rejected, setRejected] = useState<string | null>(null);

  function commit(raw: string): boolean {
    const parts = raw.split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return true;

    const accepted: string[] = [];
    let firstError: string | null = null;
    for (const part of parts) {
      const reason = rejectionReason(part);
      if (reason) { firstError = firstError ?? reason; continue; }
      const key = part.toLowerCase();
      if (value.some((v) => v.toLowerCase() === key) || accepted.some((v) => v.toLowerCase() === key)) continue;
      accepted.push(part);
    }
    if (accepted.length > 0) onChange([...value, ...accepted]);
    setRejected(firstError);
    return firstError === null;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      if (!draft.trim()) return;
      e.preventDefault();
      if (commit(draft)) setDraft('');
      return;
    }
    if (e.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">
        {label}
        {value.length > 0 && <span className="ml-2 normal-case font-normal text-emerald-accent">{value.length} added</span>}
      </label>

      <div className="input-field flex flex-wrap items-center gap-1.5 !py-2 min-h-[2.75rem]">
        {value.map((email) => (
          <span key={email}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-accent/15 text-emerald-accent border border-emerald-accent/30">
            {email}
            <button type="button" aria-label={`Remove ${email}`}
              onClick={() => onChange(value.filter((v) => v !== email))}
              className="opacity-70 hover:opacity-100">
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setRejected(null); }}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (!/[,;\s]/.test(text)) return;
            e.preventDefault();
            commit(text);
          }}
          onBlur={() => { if (draft.trim() && commit(draft)) setDraft(''); }}
          placeholder={value.length === 0 ? placeholder : 'add another…'}
          className="flex-1 min-w-[10rem] bg-transparent border-0 outline-none text-sm text-theme-heading placeholder:text-theme-muted p-0"
        />
      </div>

      {rejected && (
        <p className="text-[11px] text-danger mt-1 flex items-start gap-1.5">
          <AlertCircle size={12} className="shrink-0 mt-0.5" /> {rejected}
        </p>
      )}
      {hint && <p className="text-[11px] text-theme-muted mt-1">{hint}</p>}
    </div>
  );
}
