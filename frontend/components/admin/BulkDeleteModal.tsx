'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, Mail, Trash2, X } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

const SESSION_OTP_THRESHOLD = 10;
const ALERT_THRESHOLD = 5;

interface Challenge {
  challenge_id: string;
  expires_at: string;
  sent_to: string;
  using_previous_email: boolean;
  ttl_seconds: number;
  count?: number;
}

function remainingSeconds(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

type Kind = 'workers' | 'sessions';

interface Props {
  kind: Kind;
  ids: string[];
  labels?: string[];
  onClose: () => void;
  onDeleted: (result: { deleted_count: number; blocked_active?: string[] }) => void;
}

/**
 * Confirm bulk/single delete.
 * Workers: always email OTP to the Settings alert inbox (even for one person).
 * Sessions: confirm always; OTP when deleting more than 10.
 */
export default function BulkDeleteModal({ kind, ids, labels = [], onClose, onDeleted }: Props) {
  const [mounted, setMounted] = useState(false);
  const needsOtp = kind === 'workers' || ids.length > SESSION_OTP_THRESHOLD;
  const [step, setStep] = useState<'confirm' | 'code'>('confirm');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  const noun = kind === 'workers' ? 'worker' : 'session';
  const nouns = kind === 'workers' ? 'workers' : 'sessions';
  const requestPath = kind === 'workers' ? '/workers/delete/request-otp' : '/sessions/delete/request-otp';
  const confirmPath = kind === 'workers' ? '/workers/delete/confirm' : '/sessions/delete/confirm';
  const idKey = kind === 'workers' ? 'worker_ids' : 'session_ids';

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
      const res = await api.post<Challenge>(requestPath, { [idKey]: ids });
      setChallenge(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the confirmation code.');
      if (isFirst) setStep('confirm');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(submitted = code) {
    if (needsOtp && (!challenge || submitted.trim().length < 6)) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { [idKey]: ids };
      if (needsOtp && challenge) {
        body.challenge_id = challenge.challenge_id;
        body.code = submitted.trim();
      }
      const result = await api.post<{
        deleted_count: number;
        blocked_active?: string[];
      }>(confirmPath, body);
      onDeleted(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not delete ${nouns}.`);
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  const sample = labels.slice(0, 5);
  const extra = Math.max(0, labels.length - sample.length);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} disabled={busy} />
      <div className="glass-modal relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-theme p-5 space-y-4 shadow-2xl">
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-danger/40 bg-danger/15 text-danger">
              <Trash2 size={16} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-theme-heading">
                {step === 'code'
                  ? 'Enter confirmation code'
                  : `Delete ${ids.length} ${ids.length === 1 ? noun : nouns}?`}
              </h2>
              <p className="text-xs text-theme-muted mt-0.5">This cannot be undone.</p>
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
            <div className="text-sm text-theme-muted space-y-2">
              <p>
                Are you sure you want to permanently delete{' '}
                <span className="font-semibold text-theme-heading">{ids.length}</span>{' '}
                {ids.length === 1 ? noun : nouns}?
              </p>
              {sample.length > 0 && (
                <ul className="text-xs list-disc pl-4 space-y-0.5">
                  {sample.map((label) => (
                    <li key={label} className="text-theme-heading">{label}</li>
                  ))}
                  {extra > 0 && <li className="text-theme-muted">…and {extra} more</li>}
                </ul>
              )}
              {ids.length > ALERT_THRESHOLD && (
                <p className="flex items-start gap-1.5 text-gold-accent text-xs">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  More than {ALERT_THRESHOLD} — the Settings alert email will also be notified.
                </p>
              )}
              {needsOtp && (
                <p className="flex items-start gap-1.5 text-xs">
                  <Mail size={12} className="shrink-0 mt-0.5 text-theme-muted" />
                  {kind === 'workers'
                    ? 'A verification code will be sent to the Settings alert email before anyone can be deleted.'
                    : `More than ${SESSION_OTP_THRESHOLD} — a verification code will be sent to the Settings alert email.`}
                </p>
              )}
              {kind === 'sessions' && (
                <p className="text-[11px] text-theme-muted">Live (unended) sessions are skipped automatically.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={busy} onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
              {needsOtp ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void sendCode()}
                  className="text-sm py-2 px-4 inline-flex items-center gap-2 rounded-xl font-semibold bg-danger/90 text-white hover:bg-danger disabled:opacity-50"
                >
                  {busy ? <SpinningDots size="sm" /> : <Mail size={14} />}
                  {busy ? 'Sending…' : 'Send confirmation code'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmDelete()}
                  className="text-sm py-2 px-4 inline-flex items-center gap-2 rounded-xl font-semibold bg-danger/90 text-white hover:bg-danger disabled:opacity-50"
                >
                  {busy ? <SpinningDots size="sm" /> : <Trash2 size={14} />}
                  {busy ? 'Deleting…' : `Delete ${ids.length}`}
                </button>
              )}
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
                if (next.length === 6) void confirmDelete(next);
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
                onClick={() => void confirmDelete()}
                className="text-sm py-2 px-4 inline-flex items-center gap-2 rounded-xl font-semibold bg-danger/90 text-white hover:bg-danger disabled:opacity-50"
              >
                {busy ? <SpinningDots size="sm" /> : <Trash2 size={14} />}
                {busy ? 'Deleting…' : 'Confirm delete'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
