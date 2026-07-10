'use client';

import { useEffect, useState } from 'react';
import { Pencil, X, Check } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';

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
      <span className="text-sm text-white font-medium">{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', display_name: '', country: '' });

  useEffect(() => {
    api.get<Worker>('/workers/me')
      .then((w) => {
        setWorker(w);
        setForm({ username: w.username ?? '', display_name: w.display_name, country: w.country });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const handleEdit = () => {
    if (!worker) return;
    setForm({ username: worker.username ?? '', display_name: worker.display_name, country: worker.country });
    setSaveError(null);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!worker) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.patch<Worker>('/workers/me', {
        username: form.username.trim() || undefined,
        display_name: form.display_name.trim() || undefined,
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

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-10">
      <PageHeader
        title="My Profile"
        description="View and update your worker profile details."
        actions={
          !editing ? (
            <button className="btn-secondary flex items-center gap-2" onClick={handleEdit}>
              <Pencil size={15} />
              Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button className="btn-secondary flex items-center gap-2" onClick={handleCancel} disabled={saving}>
                <X size={15} />
                Cancel
              </button>
              <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saving}>
                <Check size={15} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )
        }
      />

      <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-6">
        {/* Identity */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gold-accent mb-4">Identity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {editing ? (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Username</label>
                  <input
                    type="text"
                    placeholder="e.g. john_doe"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    className="bg-brand-surface-high border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-accent/50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Display Name</label>
                  <input
                    type="text"
                    value={form.display_name}
                    onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                    className="bg-brand-surface-high border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-accent/50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Country</label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                    className="bg-brand-surface-high border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-accent/50"
                  />
                </div>
              </>
            ) : (
              <>
                <Field label="Username" value={worker.username ? `@${worker.username}` : <span className="text-theme-muted italic">Not set</span>} />
                <Field label="Display Name" value={worker.display_name} />
                <Field label="Country" value={worker.country} />
              </>
            )}
            <Field label="Worker Type" value={TYPE_LABELS[worker.worker_type] ?? worker.worker_type} />
            <Field
              label="Status"
              value={<StatusBadge status={worker.status === 'active' ? 'approved' : 'offline'} label={worker.status} />}
            />
          </div>
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Employment */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gold-accent mb-4">Employment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Pay Tier" value={worker.pay_tier} />
            <Field
              label="Start Date"
              value={new Date(worker.start_date).toLocaleDateString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
            />
            <Field
              label="Member Since"
              value={new Date(worker.created_at).toLocaleDateString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
            />
            <Field
              label="Last Updated"
              value={new Date(worker.updated_at).toLocaleDateString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
            />
          </div>
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* IDs */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gold-accent mb-4">Reference</h2>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Worker ID" value={<span className="font-mono text-xs">{worker.id}</span>} />
            {worker.partner_entity_id && (
              <Field label="Partner Entity ID" value={<span className="font-mono text-xs">{worker.partner_entity_id}</span>} />
            )}
          </div>
        </div>

        {saveError && <p className="text-danger text-sm">{saveError}</p>}
      </div>
    </div>
  );
}
