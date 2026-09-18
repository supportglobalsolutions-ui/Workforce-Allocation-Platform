'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, KeyRound, X } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { RdpResource, updateRdpResource } from '@/lib/rdp';
import { reportError } from '@/lib/errors';

/** Update RDP sign-in credentials without an OTP challenge. */
export default function ChangeCredentialsModal({
  machine,
  onClose,
  onSaved,
}: {
  machine: RdpResource;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState(machine.rdp_username ?? '');
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (!password) {
      setError('Enter the new password (or the current one to keep it unchanged in Guacamole).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateRdpResource(machine.id, {
        rdp_username: username.trim(),
        rdp_password: password,
        ...(domain.trim() ? { rdp_domain: domain.trim() } : {}),
        auto_provision: true,
      });
      onSaved();
    } catch (err) {
      setError(reportError('Update RDP credentials', err, { machineId: machine.id }));
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
        disabled={busy}
      />
      <form
        onSubmit={handleSave}
        className="glass-modal relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-theme shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-theme-heading">
              <KeyRound size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-base font-bold text-theme-heading truncate">
                Credentials — {machine.nickname}
              </p>
              <p className="mt-0.5 text-xs text-theme-muted">
                No confirmation code required. Guacamole is updated on save.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:bg-white/5 hover:text-theme-heading disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 py-4 space-y-3">
          {error && (
            <p className="text-xs text-danger flex items-start gap-1.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
          <label className="block">
            <span className="text-xs text-brand-on-surface-variant mb-1 block">RDP username *</span>
            <input
              required
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="text-xs text-brand-on-surface-variant mb-1 block">RDP password *</span>
            <input
              required
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={machine.has_rdp_password ? 'Enter new password' : 'Set password'}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="text-xs text-brand-on-surface-variant mb-1 block">Domain (optional)</span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="WORKGROUP"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-4">
          <button type="button" disabled={busy} onClick={onClose} className="btn-secondary text-sm py-2 px-4">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-60">
            {busy ? <SpinningDots size="sm" /> : null}
            {busy ? 'Saving…' : 'Save credentials'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
