'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';

export default function SetupUsernamePage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const clean = (v: string) => v.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
  const valid = username.trim().length >= 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError('');
    try {
      await api.patch('/workers/me', { username: username.trim().toLowerCase() });
      router.replace('/worker/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save username — please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / icon */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-accent/15 border border-emerald-accent/30 flex items-center justify-center mx-auto mb-5">
            <AtSign size={26} className="text-emerald-accent" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Choose a username</h1>
          <p className="text-sm text-theme-muted mt-2 leading-relaxed">
            Pick a unique username to finish setting up your account.<br />
            You can change it later from your profile.
          </p>
        </div>

        {/* Card */}
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">
                Username
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-theme-muted text-sm select-none">
                  @
                </span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(clean(e.target.value))}
                  placeholder="your_username"
                  className="input-field pl-8"
                />
              </div>
              <p className="text-xs text-theme-muted mt-1.5">
                Letters, numbers, and underscores · 3–32 characters
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !valid}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <CheckCircle size={16} />
              )}
              {saving ? 'Saving…' : 'Continue'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-theme-muted mt-5">
          This is a one-time setup — you won't see this again once it's set.
        </p>
      </div>
    </div>
  );
}
