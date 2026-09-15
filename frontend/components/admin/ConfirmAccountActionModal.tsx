'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Mail, ShieldAlert, Trash2, X } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

export type AccountCriticalAction = 'delete' | 'ban' | 'demote';

interface Challenge {
  challenge_id: string;
  expires_at: string;
  sent_to: string;
  using_previous_email: boolean;
  ttl_seconds: number;
}

function remainingSeconds(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

const COPY: Record<AccountCriticalAction, { title: string; body: string; confirm: string }> = {
  delete: {
    title: 'Delete this account?',
    body: 'They will not be able to sign in again. Work sessions stay on record. A 6-digit code is emailed to the Settings alert inbox before this runs.',
    confirm: 'Confirm delete',
  },
  ban: {
    title: 'Ban this Super Admin?',
    body: 'A confirmation code is required. Protected founder Super Admins cannot be banned from the app.',
    confirm: 'Confirm ban',
  },
  demote: {
    title: 'Demote this Super Admin?',
    body: 'A confirmation code is required to take Super Admin away. Protected founder accounts cannot be demoted from the app.',
    confirm: 'Confirm demotion',
  },
};

export default function ConfirmAccountActionModal({
  uid,
  email,
  displayName,
  action,
  nextRole,
  onClose,
  onDone,
}: {
  uid: string;
  email: string;
  displayName: string;
  action: AccountCriticalAction;
  nextRole?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<'confirm' | 'code'>('confirm');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const copy = COPY[action];

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (!challenge) return;
    const tick = () => setLeft(remainingSeconds(challenge.expires_at));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [challenge]);

  async function sendCode() {
    const isFirst = challenge === null;
    setStep('code');
    setCode('');
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Challenge>(`/auth/users/${uid}/critical/request-otp`, {
        action,
        role: nextRole,
      });
      setChallenge(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the confirmation code.');
      if (isFirst) setStep('confirm');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(submitted = code) {
    if (!challenge || submitted.trim().length < 6) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/auth/users/${uid}/critical/confirm`, {
        action,
        challenge_id: challenge.challenge_id,
        code: submitted.trim(),
        role: nextRole,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete that action.');
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} disabled={busy} />
      <div className="glass-modal relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-theme p-5 space-y-4 shadow-2xl">
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-danger/40 bg-danger/15 text-danger">
              {action === 'delete' ? <Trash2 size={16} /> : <ShieldAlert size={16} />}
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-theme-heading">
                {step === 'code' ? 'Enter confirmation code' : copy.title}
              </h2>
              <p className="text-xs text-theme-muted mt-0.5 truncate">{displayName} · {email}</p>
            </div>
          </div>
          <button type="button" disabled={busy} onClick={onClose} className="text-theme-muted hover:text-theme-heading disabled:opacity-50" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === 'confirm' ? (
          <>
            <p className="text-sm text-theme-muted">{copy.body}</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={busy} onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendCode()}
                className="text-sm py-2 px-4 inline-flex items-center gap-2 rounded-xl font-semibold bg-danger/90 text-white hover:bg-danger disabled:opacity-50"
              >
                {busy ? <SpinningDots size="sm" /> : <Mail size={14} />}
                {busy ? 'Sending…' : 'Send confirmation code'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-theme-muted">
              A 6-digit code was sent to{' '}
              <span className="font-semibold text-theme-heading">{challenge?.sent_to ?? '…'}</span>.
              {challenge?.using_previous_email && (
                <span className="block text-xs text-gold-accent mt-1">
                  The alert email was changed recently, so this code went to the previous inbox.
                </span>
              )}
            </p>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted block">
              Confirmation code
            </label>
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(next);
                if (next.length === 6) void confirm(next);
              }}
              placeholder="000000"
              className="input-field text-center text-2xl tracking-[0.4em] font-mono"
            />
            <p className="text-[11px] text-theme-muted">
              {left > 0 ? `Expires in ${left}s` : 'Code expired — request a new one.'}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => void sendCode()} disabled={busy || left > 150} className="btn-secondary text-sm py-2 px-4">
                Resend
              </button>
              <button
                type="button"
                disabled={busy || code.trim().length < 6}
                onClick={() => void confirm()}
                className="text-sm py-2 px-4 inline-flex items-center gap-2 rounded-xl font-semibold bg-danger/90 text-white hover:bg-danger disabled:opacity-50"
              >
                {busy ? <SpinningDots size="sm" /> : action === 'delete' ? <Trash2 size={14} /> : <ShieldAlert size={14} />}
                {busy ? 'Working…' : copy.confirm}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
