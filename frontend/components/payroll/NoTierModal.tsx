'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

/** Prefix of the backend error when "use tier" hits a worker without one. */
export const NO_TIER_ERROR_PREFIX = 'No tier allocated';

export function hasPayTier(tier: string | null | undefined): boolean {
  const t = (tier || '').trim().toLowerCase();
  return t !== '' && t !== 'unassigned';
}

interface Props {
  /** Workers without a tier; empty shows the generic message. */
  names: string[];
  onClose: () => void;
}

export default function NoTierModal({ names, onClose }: Props) {
  if (typeof document === 'undefined') return null;
  const shown = names.slice(0, 6);
  const more = names.length - shown.length;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="no-tier-title">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-modal relative z-10 w-full max-w-sm rounded-xl p-5 shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-theme-muted hover:text-white hover:bg-white/5">
          <X size={14} />
        </button>
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
            <AlertTriangle size={16} />
          </span>
          <div className="min-w-0">
            <h3 id="no-tier-title" className="text-sm font-bold text-theme-heading">No tier allocated</h3>
            <p className="mt-1 text-xs text-theme-muted">
              {names.length === 0
                ? 'This person has no payment tier, so there is no tier rate to use.'
                : names.length === 1
                  ? <><span className="text-theme-heading font-medium">{names[0]}</span> has no payment tier, so there is no tier rate to use.</>
                  : 'These people have no payment tier, so their rate was left as it was:'}
            </p>
            {names.length > 1 && (
              <ul className="mt-2 space-y-0.5 text-xs text-theme-heading">
                {shown.map((n) => <li key={n} className="truncate">• {n}</li>)}
                {more > 0 && <li className="text-theme-muted">and {more} more</li>}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-theme-muted">Assign a tier first, or type a rate instead.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Link href="/admin/payroll/tiers" className="btn-secondary text-xs py-1.5 px-3">Payment tiers</Link>
          <button type="button" onClick={onClose} className="btn-primary text-xs py-1.5 px-3">OK</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
