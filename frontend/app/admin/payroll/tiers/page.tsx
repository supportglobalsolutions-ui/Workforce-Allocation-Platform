'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { worldCurrencies, type WorldCurrency } from '@/lib/world-currencies';

type TierUnit = 'per_hour' | 'per_day' | 'per_week' | 'per_month' | 'per_task';

interface PaymentTier {
  id: string;
  name: string;
  currency: string;
  rate: string | number;
  unit: TierUnit;
  is_active: boolean;
  description: string | null;
  hourly_equivalent: string | number | null;
  member_count?: number;
}

interface WorkerLite {
  id: string;
  display_name: string;
  country: string;
  pay_tier: string;
  worker_type: string;
  partner_entity_id?: string | null;
  status: string;
}

const UNIT_LABELS: Record<TierUnit, string> = {
  per_hour: 'Per hour',
  per_day: 'Per day',
  per_week: 'Per week',
  per_month: 'Per month',
  per_task: 'Per task',
};

const emptyForm = {
  name: '',
  currency: 'USD',
  rate: '',
  unit: 'per_hour' as TierUnit,
  description: '',
};

export default function PaymentTiersPage() {
  const [tiers, setTiers] = useState<PaymentTier[]>([]);
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const currencies: WorldCurrency[] = useMemo(() => worldCurrencies(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editTier, setEditTier] = useState<PaymentTier | null>(null);
  const [deleteTierTarget, setDeleteTierTarget] = useState<PaymentTier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [applyTierId, setApplyTierId] = useState<string | null>(null);
  const [applyTab, setApplyTab] = useState<'pending' | 'members'>('pending');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'gs_registered' | 'partner_worker'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<PaymentTier[]>('/payment-tiers'),
      api.get<WorkerLite[]>('/workers'),
    ])
      .then(([t, w]) => {
        setTiers(t);
        setWorkers(w.filter((x) => x.status === 'active'));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeApplyTier = tiers.find((t) => t.id === applyTierId);

  const pendingWorkers = useMemo(() => {
    if (!activeApplyTier) return [];
    const q = search.trim().toLowerCase();
    return workers.filter((w) => {
      if (w.pay_tier === activeApplyTier.name) return false;
      if (typeFilter !== 'all' && w.worker_type !== typeFilter) return false;
      if (!q) return true;
      return (
        w.display_name.toLowerCase().includes(q) ||
        w.country.toLowerCase().includes(q) ||
        (w.pay_tier || '').toLowerCase().includes(q)
      );
    });
  }, [workers, search, typeFilter, activeApplyTier]);

  const memberWorkers = useMemo(() => {
    if (!activeApplyTier) return [];
    const q = search.trim().toLowerCase();
    return workers.filter((w) => {
      if (w.pay_tier !== activeApplyTier.name) return false;
      if (typeFilter !== 'all' && w.worker_type !== typeFilter) return false;
      if (!q) return true;
      return w.display_name.toLowerCase().includes(q) || w.country.toLowerCase().includes(q);
    });
  }, [workers, search, typeFilter, activeApplyTier]);

  const visibleList = applyTab === 'pending' ? pendingWorkers : memberWorkers;

  const openCreate = () => {
    setForm(emptyForm);
    setEditTier(null);
    setShowCreate(true);
  };

  const openEdit = (t: PaymentTier) => {
    setEditTier(t);
    setForm({
      name: t.name,
      currency: t.currency,
      rate: String(t.rate),
      unit: t.unit,
      description: t.description || '',
    });
    setShowCreate(true);
  };

  const saveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      currency: form.currency,
      rate: Number(form.rate),
      unit: form.unit,
      description: form.description.trim() || null,
    };
    try {
      if (editTier) {
        await api.patch(`/payment-tiers/${editTier.id}`, payload);
      } else {
        await api.post('/payment-tiers', payload);
      }
      setForm(emptyForm);
      setShowCreate(false);
      setEditTier(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tier');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteTier = async () => {
    if (!deleteTierTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/payment-tiers/${deleteTierTarget.id}`);
      if (applyTierId === deleteTierTarget.id) setApplyTierId(null);
      setDeleteTierTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tier');
    } finally {
      setDeleting(false);
    }
  };

  const toggleAll = () => {
    if (selected.size === visibleList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleList.map((w) => w.id)));
    }
  };

  const runAssign = async () => {
    if (!applyTierId) return;
    if (!selected.size) {
      setError('Select at least one worker.');
      return;
    }
    setApplying(true);
    setApplyMsg(null);
    setError(null);
    try {
      const res = await api.post<{ assigned: number; tier_name: string }>(
        `/payment-tiers/${applyTierId}/assign`,
        { worker_ids: Array.from(selected) },
      );
      setApplyMsg(`Assigned “${res.tier_name}” to ${res.assigned} worker${res.assigned === 1 ? '' : 's'}.`);
      setSelected(new Set());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed');
    } finally {
      setApplying(false);
    }
  };

  const runUnassign = async () => {
    if (!applyTierId) return;
    if (!selected.size) {
      setError('Select at least one member to remove.');
      return;
    }
    setApplying(true);
    setApplyMsg(null);
    setError(null);
    try {
      const res = await api.post<{ removed: number; tier_name: string }>(
        `/payment-tiers/${applyTierId}/unassign`,
        { worker_ids: Array.from(selected) },
      );
      setApplyMsg(`Removed ${res.removed} worker${res.removed === 1 ? '' : 's'} from “${res.tier_name}”.`);
      setSelected(new Set());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Payment Tiers"
        actions={
          <button type="button" onClick={openCreate} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
            <Plus size={14} /> New tier
          </button>
        }
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {applyMsg && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-sm">
          <Check size={14} /> {applyMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : (
        <div className="space-y-6">
          <div className="glass-panel overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Name</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Rate</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Unit</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Hourly equiv.</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Members</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {tiers.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-theme-muted">No payment tiers yet.</td></tr>
                ) : tiers.map((t) => (
                  <tr key={t.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-3 text-white font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-theme-muted">{Number(t.rate).toFixed(2)} {t.currency}</td>
                    <td className="px-4 py-3 text-theme-muted">{UNIT_LABELS[t.unit]}</td>
                    <td className="px-4 py-3 text-theme-muted">
                      {t.hourly_equivalent != null ? `${Number(t.hourly_equivalent).toFixed(2)} /hr` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">{t.member_count ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        t.is_active ? 'text-emerald-accent border-emerald-accent/30 bg-emerald-accent/10' : 'text-theme-muted border-white/10'
                      }`}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => openEdit(t)} className="btn-secondary text-xs py-1.5 px-2 mr-1 inline-flex items-center gap-1">
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        disabled={!t.is_active}
                        onClick={() => { setApplyTierId(t.id); setApplyTab('pending'); setSelected(new Set()); setApplyMsg(null); }}
                        className="btn-secondary text-xs py-1.5 px-3 mr-1"
                      >
                        Apply
                      </button>
                      <button type="button" onClick={() => setDeleteTierTarget(t)} className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1 text-danger">
                        <Trash2 size={12} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {applyTierId && activeApplyTier && (
            <div className="glass-panel p-5 space-y-4 border border-emerald-accent/20">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-theme-heading">Apply “{activeApplyTier.name}”</h2>
                  <p className="text-xs text-theme-muted mt-0.5">
                    {workers.filter((w) => w.pay_tier === activeApplyTier.name).length} on this tier · pending list is people not yet attached
                  </p>
                </div>
                <button type="button" onClick={() => setApplyTierId(null)} className="text-theme-muted hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setApplyTab('pending'); setSelected(new Set()); }}
                  className={`text-xs py-1.5 px-3 rounded-lg border ${
                    applyTab === 'pending'
                      ? 'border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent'
                      : 'border-white/10 text-theme-muted'
                  }`}
                >
                  Pending ({pendingWorkers.length})
                </button>
                <button
                  type="button"
                  onClick={() => { setApplyTab('members'); setSelected(new Set()); }}
                  className={`text-xs py-1.5 px-3 rounded-lg border ${
                    applyTab === 'members'
                      ? 'border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent'
                      : 'border-white/10 text-theme-muted'
                  }`}
                >
                  On this tier ({memberWorkers.length})
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="relative w-full sm:w-auto flex-1 min-w-[180px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search workers…"
                    className="input-field pl-9 w-full"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                  className="input-field w-full sm:w-auto"
                >
                  <option value="all">All types</option>
                  <option value="gs_registered">GS members</option>
                  <option value="partner_worker">Partners</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                {applyTab === 'pending' ? (
                  <button type="button" disabled={applying} onClick={() => void runAssign()} className="btn-primary text-xs py-2 px-3">
                    Apply to selected ({selected.size})
                  </button>
                ) : (
                  <button type="button" disabled={applying} onClick={() => void runUnassign()} className="btn-primary text-xs py-2 px-3">
                    Remove selected ({selected.size})
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-brand-surface-lowest">
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-3 py-2 text-left">
                        <input type="checkbox" checked={selected.size === visibleList.length && visibleList.length > 0} onChange={toggleAll} />
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-theme-muted">Worker</th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-theme-muted">Type</th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-theme-muted">Current tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-theme-muted text-xs">
                          {applyTab === 'pending' ? 'Everyone is already on this tier.' : 'No members on this tier yet.'}
                        </td>
                      </tr>
                    ) : visibleList.map((w) => (
                      <tr key={w.id} className="border-b border-white/[0.04]">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(w.id)}
                            onChange={() => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(w.id)) next.delete(w.id);
                                else next.add(w.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-white">{w.display_name}</td>
                        <td className="px-3 py-2 text-theme-muted text-xs">
                          {w.worker_type === 'partner_worker' ? 'Partner' : 'GS'}
                        </td>
                        <td className="px-3 py-2 text-theme-muted text-xs">{w.pay_tier || 'unassigned'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setEditTier(null); } }}>
          <form onSubmit={saveTier} className="glass-panel w-full max-w-md p-5 space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-base font-bold text-white">{editTier ? 'Edit payment tier' : 'New payment tier'}</h2>
              <button type="button" onClick={() => { setShowCreate(false); setEditTier(null); }} className="text-theme-muted hover:text-white"><X size={16} /></button>
            </div>
            <label className="block">
              <span className="text-[10px] font-bold uppercase text-theme-muted">Name *</span>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. 8" className="input-field mt-1" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-theme-muted">Currency *</span>
                <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="input-field mt-1">
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-theme-muted">Rate *</span>
                <input required type="number" min="0.01" step="0.01" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} className="input-field mt-1" />
              </label>
            </div>
            <label className="block">
              <span className="text-[10px] font-bold uppercase text-theme-muted">Per *</span>
              <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as TierUnit }))} className="input-field mt-1">
                {(Object.keys(UNIT_LABELS) as TierUnit[]).map((u) => (
                  <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                ))}
              </select>
              <p className="text-[10px] text-theme-muted mt-1">
                Changing name, rate, or currency updates every worker on this tier.
              </p>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase text-theme-muted">Description</span>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field mt-1" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setShowCreate(false); setEditTier(null); }} className="btn-secondary text-sm py-2 px-4">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4">{saving ? 'Saving…' : (editTier ? 'Save' : 'Create')}</button>
            </div>
          </form>
        </div>
      )}

      {deleteTierTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTierTarget(null); }}
        >
          <div className="glass-panel w-full max-w-md p-5 space-y-4 border border-danger/20">
            <div className="flex justify-between items-start gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-danger/40 bg-danger/15 text-danger">
                  <Trash2 size={16} />
                </span>
                <div>
                  <h2 className="text-base font-bold text-white">Delete this tier?</h2>
                  <p className="text-xs text-theme-muted mt-0.5">This cannot be undone from this screen.</p>
                </div>
              </div>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTierTarget(null)}
                className="text-theme-muted hover:text-white disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-theme-heading">
              Delete <span className="font-semibold text-white">“{deleteTierTarget.name}”</span>
              {deleteTierTarget.member_count ? ` (${deleteTierTarget.member_count} member${deleteTierTarget.member_count === 1 ? '' : 's'})` : ''}?
            </p>
            <ul className="text-xs text-theme-muted space-y-1 list-disc pl-4">
              <li>People on this tier become unassigned.</li>
              <li>Pay them again after you assign another tier.</li>
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={deleting} onClick={() => setDeleteTierTarget(null)} className="btn-secondary text-sm py-2 px-4">
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDeleteTier()}
                className="text-sm py-2 px-4 inline-flex items-center gap-2 rounded-xl font-semibold bg-danger/90 text-white hover:bg-danger disabled:opacity-50"
              >
                {deleting ? <SpinningDots size="sm" /> : <Trash2 size={14} />}
                {deleting ? 'Deleting…' : 'Yes, delete tier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
