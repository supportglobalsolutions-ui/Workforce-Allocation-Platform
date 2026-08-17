'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Mail, Trash2, X } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

interface Period {
  id: string;
  label: string;
}

interface Challenge {
  challenge_id: string;
  expires_at: string;
  sent_to: string;
  using_previous_email: boolean;
  ttl_seconds: number;
  period_label: string;
}

function remainingSeconds(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

/** Confirm, then enter the 3-minute email code, then the period is gone. */
export default function DeletePeriodModal({
  period, onClose, onDeleted,
}: {
  period: Period;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<'confirm' | 'code'>('confirm');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

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
    setBusy(true); setError(null);
    try {
      const res = await api.post<Challenge>(`/payroll/periods/${period.id}/delete/request-otp`, {});
      setChallenge(res);
      setCode('');
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the confirmation code.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(submitted = code) {
    if (!challenge || submitted.trim().length < 6) return;
    setBusy(true); setError(null);
    try {
      await api.post(`/payroll/periods/${period.id}/delete/confirm`, {
        challenge_id: challenge.challenge_id,
        code: submitted.trim(),
      });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete this work period.');
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="glass-modal relative z-10 w-full max-w-lg overflow-hidden rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-danger/40 bg-danger/15 text-danger">
              <Trash2 size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-base font-bold text-theme-heading">Delete {period.label}?</p>
              <p className="mt-0.5 text-xs text-theme-muted">This cannot be undone.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:bg-white/5 hover:text-theme-heading">
            <X size={16} />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <p className="text-xs text-danger flex items-start gap-1.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}

          {step === 'confirm' ? (
            <>
              <p className="text-sm text-theme-heading">
                Are you sure you want to do this? It will delete all data related to this work period.
              </p>
              <ul className="text-xs text-theme-muted space-y-1 list-disc pl-4">
                <li>Payslip rows, bonuses, cost pools and period quality scores are removed.</li>
                <li>Worker sessions stay in history; they are unlinked from this month.</li>
                <li>Wallet credits already pushed stay in wallets.</li>
              </ul>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
                <button type="button" onClick={() => void sendCode()} disabled={busy}
                  className="text-sm py-2 px-4 inline-flex items-center gap-2 rounded-xl font-semibold bg-danger/90 text-white hover:bg-danger disabled:opacity-50">
                  {busy ? <SpinningDots size="sm" /> : <Mail size={14} />}
                  Yes, send confirmation code
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-theme-heading">
                A 6-digit code was sent to <span className="font-semibold">{challenge?.sent_to}</span>.
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
                <button type="button" onClick={() => void sendCode()} disabled={busy || left > 150}
                  className="btn-secondary text-sm py-2 px-4 disabled:opacity-50">
                  Resend
                </button>
                <button type="button" onClick={() => void confirmDelete()} disabled={busy || code.length < 6 || left === 0}
                  className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50">
                  {busy ? <SpinningDots size="sm" /> : <Trash2 size={14} />}
                  Delete period
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
