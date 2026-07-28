'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Plus, Search, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

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

interface CurrencyRow {
  currency_code: string;
  is_active: boolean;
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
  const [currencies, setCurrencies] = useState<string[]>(['USD', 'GBP']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [applyTierId, setApplyTierId] = useState<string | null>(null);
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
      api.get<{ currency_code: string; is_active: boolean }[]>('/currencies/countries').catch(() => [] as { currency_code: string; is_active: boolean }[]),
    ])
      .then(([t, w, c]) => {
        setTiers(t);
        setWorkers(w.filter((x) => x.status === 'active'));
        const codes = [...new Set(c.filter((x) => x.is_active).map((x) => x.currency_code))];
        if (codes.length) setCurrencies(codes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter((w) => {
      if (typeFilter !== 'all' && w.worker_type !== typeFilter) return false;
      if (!q) return true;
      return (
        w.display_name.toLowerCase().includes(q) ||
        w.country.toLowerCase().includes(q) ||
        (w.pay_tier || '').toLowerCase().includes(q)
      );
    });
  }, [workers, search, typeFilter]);

  const createTier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/payment-tiers', {
        name: form.name.trim(),
        currency: form.currency,
        rate: Number(form.rate),
        unit: form.unit,
        description: form.description.trim() || null,
      });
      setForm(emptyForm);
      setShowCreate(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tier');
    } finally {
      setSaving(false);
    }
  };

  const toggleAll = () => {
    if (selected.size === filteredWorkers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredWorkers.map((w) => w.id)));
    }
  };

  const runAssign = async (mode: 'selected' | 'filtered' | 'all') => {
    if (!applyTierId) return;
    setApplying(true);
    setApplyMsg(null);
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (mode === 'all') {
        body = { apply_all_active: true };
      } else if (mode === 'filtered') {
        body = {
          worker_ids: filteredWorkers.map((w) => w.id),
          ...(typeFilter !== 'all' ? { worker_type: typeFilter } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        };
      } else {
        if (!selected.size) {
          setError('Select at least one worker.');
          setApplying(false);
          return;
        }
        body = { worker_ids: Array.from(selected) };
      }
      const res = await api.post<{ assigned: number; tier_name: string }>(
        `/payment-tiers/${applyTierId}/assign`,
        body,
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

  const activeApplyTier = tiers.find((t) => t.id === applyTierId);

  return (
    <div>
      <PageHeader
        title="Payment Tiers"
        description="Create named rates (currency, amount, per hour/day/week/month), then apply to workers with search and filters."
        actions={
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
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
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Name</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Rate</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Unit</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Hourly equiv.</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {tiers.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-theme-muted">No payment tiers yet.</td></tr>
                ) : tiers.map((t) => (
                  <tr key={t.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-3 text-white font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-theme-muted">{Number(t.rate).toFixed(2)} {t.currency}</td>
                    <td className="px-4 py-3 text-theme-muted">{UNIT_LABELS[t.unit]}</td>
                    <td className="px-4 py-3 text-theme-muted">
                      {t.hourly_equivalent != null ? `${Number(t.hourly_equivalent).toFixed(2)} /hr` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        t.is_active ? 'text-emerald-accent border-emerald-accent/30 bg-emerald-accent/10' : 'text-theme-muted border-white/10'
                      }`}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={!t.is_active}
                        onClick={() => { setApplyTierId(t.id); setApplyMsg(null); }}
                        className="btn-secondary text-xs py-1.5 px-3"
                      >
                        Apply
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
                    Search, filter GS / partners, select individuals, or apply to the filtered set.
                  </p>
                </div>
                <button type="button" onClick={() => setApplyTierId(null)} className="text-theme-muted hover:text-white">
                  <X size={16} />
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
                <button type="button" disabled={applying} onClick={() => runAssign('selected')} className="btn-primary text-xs py-2 px-3">
                  Apply to selected ({selected.size})
                </button>
                <button type="button" disabled={applying} onClick={() => runAssign('filtered')} className="btn-secondary text-xs py-2 px-3">
                  Apply to filtered ({filteredWorkers.length})
                </button>
                <button type="button" disabled={applying} onClick={() => runAssign('all')} className="btn-secondary text-xs py-2 px-3">
                  Apply to all active
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-brand-surface-lowest">
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-3 py-2 text-left">
                        <input type="checkbox" checked={selected.size === filteredWorkers.length && filteredWorkers.length > 0} onChange={toggleAll} />
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-theme-muted">Worker</th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-theme-muted">Type</th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-theme-muted">Current tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorkers.map((w) => (
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <form onSubmit={createTier} className="glass-panel w-full max-w-md p-5 space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-base font-bold text-white">New payment tier</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="text-theme-muted hover:text-white"><X size={16} /></button>
            </div>
            <label className="block">
              <span className="text-[10px] font-bold uppercase text-theme-muted">Name *</span>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. 4hrs per hour" className="input-field mt-1" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-theme-muted">Currency *</span>
                <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="input-field mt-1">
                  {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
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
                Day÷8, week÷40, month÷160 convert to the hourly rate used in payroll.
              </p>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase text-theme-muted">Description</span>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field mt-1" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4">{saving ? 'Saving…' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
