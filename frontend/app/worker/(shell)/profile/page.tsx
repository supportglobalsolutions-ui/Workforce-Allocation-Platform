'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil, X, Check, LayoutDashboard, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';

interface Worker {
  id: string;
  username: string | null;
  display_name: string;
  country: string;
  pay_tier: string;
  status: string;
  worker_type: string;
  start_date: string;
  created_at: string;
  updated_at: string;
  partner_entity_id: string | null;
  admin_user_id: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  gs_registered: 'GS Registered',
  partner_worker: 'Partner Worker',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">{label}</span>
      <span className="text-sm text-theme-heading font-medium">{value}</span>
    </div>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-2xl font-black text-theme-heading tracking-tight">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-theme-muted">{label}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { session } = useAuth();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', country: '' });

  useEffect(() => {
    api.get<Worker>('/workers/me')
      .then((w) => {
        setWorker(w);
        setForm({ username: w.username ?? '', country: w.country });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const cleanUsername = (v: string) => v.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);

  const handleEdit = () => {
    if (!worker) return;
    setForm({ username: worker.username ?? '', country: worker.country });
    setSaveError(null);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!worker) return;
    const username = form.username.trim().toLowerCase();
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.patch<Worker>('/workers/me', {
        username: username || undefined,
        // one name only — the username is also the display name
        display_name: username || undefined,
        country: form.country.trim() || undefined,
      });
      setWorker(updated);
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-theme-muted text-sm animate-pulse">Loading profile…</p>
      </div>
    );
  }

  if (error || !worker) {
    return (
      <div className="glass-panel rounded-2xl border border-danger/20 p-6 max-w-lg">
        <p className="text-danger text-sm">{error ?? 'Worker profile not found.'}</p>
      </div>
    );
  }

  const rawName = worker.username || worker.display_name;
  const displayName = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : '—';
  const initials = rawName ? rawName.slice(0, 2).toUpperCase() : '?';
  const email = session?.email;
  const memberSince = new Date(worker.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="max-w-4xl mx-auto pb-10">
      {/* Hero banner — deep emerald with gold glow, like the reference's colored header */}
      <div className="relative h-44 md:h-52 rounded-2xl overflow-hidden bg-gradient-to-br from-[#032F25] via-[#0A4D3A] to-[#032F25]">
        <div className="absolute inset-0 bg-[radial-gradient(600px_200px_at_80%_0%,rgba(212,175,55,0.18),transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(500px_220px_at_15%_100%,rgba(63,199,160,0.2),transparent_60%)]" />
      </div>

      {/* Profile card — overlaps the banner, avatar overlaps the card */}
      <div className="relative -mt-24 md:-mt-28 px-4 md:px-10">
        <div className="glass-panel relative pt-16 pb-8 px-6">
          {/* Avatar */}
          <div
            className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-gradient-to-br from-emerald-accent to-[#0A4D3A] flex items-center justify-center text-white text-3xl font-black shadow-xl"
            style={{ border: '4px solid var(--card-bg)' }}
          >
            {initials}
            <span className="absolute bottom-0.5 right-0.5 w-6 h-6 rounded-full bg-gold-accent text-[#032F25] flex items-center justify-center">
              <Star size={13} fill="currentColor" />
            </span>
          </div>

          {/* Corner links */}
          <Link
            href="/worker/dashboard"
            className="absolute top-5 left-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-accent hover:opacity-80 transition-opacity"
          >
            <LayoutDashboard size={16} />
            Dashboard
          </Link>
          {!editing ? (
            <button
              type="button"
              onClick={handleEdit}
              className="absolute top-5 right-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-accent hover:opacity-80 transition-opacity"
            >
              Edit
              <Pencil size={15} />
            </button>
          ) : (
            <div className="absolute top-5 right-6 flex items-center gap-4">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-theme-muted hover:text-theme-heading transition-colors"
              >
                <X size={14} />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-accent hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                <Check size={15} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          {/* Identity — centered */}
          <div className="text-center mt-2">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-theme-heading tracking-tight">
              {displayName}
            </h1>
            <p className="text-sm text-theme-muted mt-1.5">{worker.country || '—'}</p>
            <p className="text-sm text-theme-body mt-3">
              {email ?? <span className="text-theme-muted italic">No email on file</span>}
            </p>
          </div>

          <div className="border-t border-theme mt-7 mb-6 mx-2 md:mx-10" />

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <Stat value={worker.pay_tier} label="Pay Tier" />
            <Stat
              value={
                <span className={worker.status === 'active' ? 'text-emerald-accent' : 'text-theme-muted'}>
                  {worker.status}
                </span>
              }
              label="Status"
            />
            <Stat value={TYPE_LABELS[worker.worker_type] ?? worker.worker_type} label="Worker Type" />
          </div>
        </div>
      </div>

      {/* Highlight strip — employment summary, gold accent */}
      <div className="glass-panel mt-8 px-6 py-5 flex flex-wrap items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-gold-accent/10 text-gold-accent flex items-center justify-center shrink-0">
          <Star size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-theme-muted">Employment</p>
          <p className="text-sm font-bold text-theme-heading mt-0.5">
            {worker.pay_tier}
            <span className="font-normal text-theme-muted"> · started {new Date(worker.start_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </p>
        </div>
        <p className="text-sm text-theme-muted ml-auto">Member since {memberSince}.</p>
      </div>

      {/* Details section */}
      <div className="mt-10 flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-theme-heading tracking-tight">Profile details</h2>
          <p className="text-sm text-theme-muted mt-1">
            {editing ? 'Update your details below, then save.' : 'Your account information.'}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={handleEdit}
            className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-accent hover:opacity-80 transition-opacity"
          >
            Edit
          </button>
        )}
      </div>

      <div className="glass-panel mt-4 p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {editing ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted text-sm select-none">@</span>
                  <input
                    type="text"
                    placeholder="your_username"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: cleanUsername(e.target.value) }))}
                    className="input-field pl-7"
                  />
                </div>
                <p className="text-[11px] text-theme-muted">This is also your display name.</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Country</label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  className="input-field"
                />
              </div>
            </>
          ) : (
            <>
              <Field label="Username" value={worker.username ? `@${worker.username}` : <span className="text-theme-muted italic">Not set</span>} />
              <Field label="Country" value={worker.country} />
            </>
          )}
          <Field
            label="Email"
            value={
              <span className="flex items-center gap-2">
                {email ?? <span className="text-theme-muted italic">—</span>}
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-theme text-theme-muted">From sign-in</span>
              </span>
            }
          />
          <Field
            label="Last Updated"
            value={new Date(worker.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          />
        </div>

        <div className="border-t border-theme" />

        <div className="grid grid-cols-1 gap-3">
          <Field label="Worker ID" value={<span className="font-mono text-xs">{worker.id}</span>} />
          {worker.partner_entity_id && (
            <Field label="Partner Entity ID" value={<span className="font-mono text-xs">{worker.partner_entity_id}</span>} />
          )}
        </div>

        {saveError && <p className="text-danger text-sm">{saveError}</p>}
      </div>
    </div>
  );
}
