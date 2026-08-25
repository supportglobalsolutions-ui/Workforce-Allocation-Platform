'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle, Send, Wallet, X } from 'lucide-react';
import SpinningDots from '@/components/shared/SpinningDots';

export type ConfirmTone = 'primary' | 'danger' | 'gold';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: LucideIcon;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE = {
  primary: {
    iconWrap: 'border-emerald-accent/40 bg-emerald-accent/15 text-emerald-accent',
    button: 'btn-primary',
  },
  gold: {
    iconWrap: 'border-gold-accent/40 bg-gold-accent/15 text-gold-accent',
    button: 'btn-primary',
  },
  danger: {
    iconWrap: 'border-danger/40 bg-danger/15 text-danger',
    button: 'text-sm py-2 px-4 inline-flex items-center gap-2 rounded-xl font-semibold bg-danger/90 text-white hover:bg-danger disabled:opacity-50',
  },
} as const;

/** Themed confirm dialog — replaces browser window.confirm. */
export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  icon: Icon,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy, onCancel]);

  if (!mounted || !open) return null;

  const styles = TONE[tone];
  const IconComp = Icon ?? (tone === 'danger' ? AlertTriangle : CheckCircle);

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div className="glass-modal relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-theme p-5 space-y-4 shadow-2xl">
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${styles.iconWrap}`}>
              <IconComp size={16} />
            </span>
            <div className="min-w-0">
              <h2 id="confirm-modal-title" className="text-base font-bold text-theme-heading">{title}</h2>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Close"
            className="text-theme-muted hover:text-theme-heading disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-sm text-theme-muted leading-relaxed">{body}</div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onCancel} className="btn-secondary text-sm py-2 px-4">
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`${styles.button} text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50`}
          >
            {busy ? <SpinningDots size="sm" /> : <IconComp size={14} />}
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const FINANCE_CONFIRM_META: Record<
  'approve' | 'push-wallets' | 'mark-paid',
  { title: string; confirmLabel: string; tone: ConfirmTone; icon: LucideIcon }
> = {
  approve: {
    title: 'Approve this month?',
    confirmLabel: 'Approve',
    tone: 'primary',
    icon: CheckCircle,
  },
  'push-wallets': {
    title: 'Push to wallets?',
    confirmLabel: 'Push wallets',
    tone: 'gold',
    icon: Wallet,
  },
  'mark-paid': {
    title: 'Mark month as paid?',
    confirmLabel: 'Mark paid',
    tone: 'danger',
    icon: Send,
  },
};
