'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Building2, CheckCircle, ChevronDown, ChevronRight, Eye, Info,
  Plus, Search, Users, UserCheck, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PEOPLE_TABS } from '@/components/platform/AdminSectionTabs';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Partner {
  id: string;
  name: string;
  notes: string | null;
  status: 'active' | 'inactive';
  is_self: boolean;
  created_at: string;
  worker_count: number;
}

interface Arrangement {
  id: string;
  partner_entity_id: string;
  worker_pct: number;
  gs_pct: number;
  partner_pct: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}

interface PartnerWorker {
  id: string;
  display_name: string;
  country: string;
  worker_type: string;
  pay_tier: string;
  status: string;
  start_date: string;
  work_ready: boolean;
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function SelfBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold-accent/20 text-gold-accent border border-gold-accent/30">
      Self
    </span>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── "How partners work" info panel ─────────────────────────────────────────────

function HowPartnersWork() {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-panel mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <Info size={14} className="text-gold-accent shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-gold-accent">How partners work</span>
        <ChevronRight size={14} className={`text-theme-muted ml-auto transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 text-xs text-theme-muted leading-relaxed">
          <ol className="list-decimal list-inside space-y-1">
            <li>A person signs up for an account on the platform.</li>
            <li>An admin approves the account as a <span className="text-white">Partner worker</span> and selects the partner company they belong to.</li>
            <li>The worker logs multilog earnings while working under that partner.</li>
            <li>Payroll splits those earnings according to the partner&apos;s active revenue-split arrangement (Worker / GS / Partner percentages).</li>
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Create Partner Modal ───────────────────────────────────────────────────────

interface CreateForm { name: string; notes: string; status: 'active' | 'inactive'; is_self: boolean; }
const EMPTY_CREATE: CreateForm = { name: '', notes: '', status: 'active', is_self: false };

function CreatePartnerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Partner) => void }) {
  const [form, setForm] = useState<CreateForm>({ ...EMPTY_CREATE });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const created = await api.post<Partner>('/partners', {
        name: form.name.trim(),
        notes: form.notes.trim() || undefined,
        status: form.status,
        is_self: form.is_self,
      });
      onCreated(created);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create partner.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white">Add Partner</h2>
          <button type="button" onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Name *</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Partner company name" className="input-field" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes…" rows={3} className="input-field resize-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Status</label>
            <div className="relative">
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
                className="input-field appearance-none pr-8 capitalize">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
            </div>
          </div>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={form.is_self}
              onChange={(e) => setForm((f) => ({ ...f, is_self: e.target.checked }))}
              className="mt-0.5 accent-emerald-400" />
            <span>
              <span className="text-sm text-white block">Independent partner (self)</span>
              <span className="text-xs text-theme-muted">
                This partner represents an individual acting as their own partner company, rather than an external organization.
              </span>
            </span>
          </label>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={saving || !form.name.trim()}
              className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" className="text-emerald-accent" /> : <Plus size={14} />}
              Create Partner
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Partner Detail Modal ───────────────────────────────────────────────────────

type PartnerTab = 'overview' | 'splits' | 'workers';

interface ArrangementForm {
  worker_pct: string;
  gs_pct: string;
  partner_pct: string;
  effective_from: string;
  notes: string;
}

function PartnerDetailModal({
  partner, onClose, onUpdated,
}: {
  partner: Partner;
  onClose: () => void;
  onUpdated: (p: Partner) => void;
}) {
  const [tab, setTab] = useState<PartnerTab>('overview');

  // Overview edit state
  const [form, setForm] = useState({
    name: partner.name,
    notes: partner.notes ?? '',
    status: partner.status,
    is_self: partner.is_self,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Arrangements
  const [arrangements, setArrangements] = useState<Arrangement[] | null>(null);
  const [arrError, setArrError] = useState<string | null>(null);
  const [showArrForm, setShowArrForm] = useState(false);
  const [arrForm, setArrForm] = useState<ArrangementForm>({
    worker_pct: '', gs_pct: '', partner_pct: '', effective_from: todayISO(), notes: '',
  });
  const [arrSaving, setArrSaving] = useState(false);
  const [arrSaveError, setArrSaveError] = useState<string | null>(null);

  // Workers
  const [workers, setWorkers] = useState<PartnerWorker[] | null>(null);
  const [workersError, setWorkersError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'splits' || arrangements !== null) return;
    api.get<Arrangement[]>(`/partners/${partner.id}/arrangements`)
      .then(setArrangements)
      .catch((e) => setArrError(e instanceof Error ? e.message : 'Failed to load arrangements'));
  }, [tab, arrangements, partner.id]);

  useEffect(() => {
    if (tab !== 'workers' || workers !== null) return;
    api.get<PartnerWorker[]>(`/partners/${partner.id}/workers`)
      .then(setWorkers)
      .catch((e) => setWorkersError(e instanceof Error ? e.message : 'Failed to load workers'));
  }, [tab, workers, partner.id]);

  async function handleSave() {
    setSaving(true); setSaveError(null); setSaveSuccess(false);
    try {
      const updated = await api.patch<Partner>(`/partners/${partner.id}`, {
        name: form.name.trim(),
        notes: form.notes.trim() || null,
        status: form.status,
        is_self: form.is_self,
      });
      onUpdated({ ...partner, ...updated });
      setSaveSuccess(true);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save.');
    } finally { setSaving(false); }
  }

  const pctSum =
    (parseFloat(arrForm.worker_pct) || 0) +
    (parseFloat(arrForm.gs_pct) || 0) +
    (parseFloat(arrForm.partner_pct) || 0);
  const pctValid = Math.abs(pctSum - 100) < 0.001;

  async function handleCreateArrangement(e: React.FormEvent) {
    e.preventDefault();
    if (!pctValid) return;
    setArrSaving(true); setArrSaveError(null);
    try {
      const created = await api.post<Arrangement>('/partners/arrangements', {
        partner_entity_id: partner.id,
        worker_pct: parseFloat(arrForm.worker_pct),
        gs_pct: parseFloat(arrForm.gs_pct),
        partner_pct: parseFloat(arrForm.partner_pct),
        effective_from: arrForm.effective_from,
        notes: arrForm.notes.trim() || undefined,
      });
      setArrangements((prev) => [created, ...(prev ?? [])]);
      setShowArrForm(false);
      setArrForm({ worker_pct: '', gs_pct: '', partner_pct: '', effective_from: todayISO(), notes: '' });
    } catch (e: unknown) {
      setArrSaveError(e instanceof Error ? e.message : 'Failed to create arrangement.');
    } finally { setArrSaving(false); }
  }

  const sortedArrangements = useMemo(
    () => (arrangements ?? []).slice().sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
    [arrangements],
  );
  const currentArrangementId = sortedArrangements[0]?.id ?? null;

  const TABS: { key: PartnerTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'splits', label: 'Revenue Splits' },
    { key: 'workers', label: 'Workers' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06] shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">{partner.name}</h2>
              {partner.is_self && <SelfBadge />}
            </div>
            <p className="text-xs text-theme-muted mt-0.5">
              Partner company · {partner.worker_count} worker{partner.worker_count !== 1 ? 's' : ''}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-white/[0.06] px-5 shrink-0">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                tab === t.key ? 'text-emerald-400 border-emerald-400' : 'text-theme-muted border-transparent hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">
          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Name</label>
                <input value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setSaveSuccess(false); }}
                  className="input-field" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={(e) => { setForm((f) => ({ ...f, notes: e.target.value })); setSaveSuccess(false); }}
                  rows={3} className="input-field resize-none" placeholder="Optional notes…" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Status</label>
                  <div className="relative">
                    <select value={form.status}
                      onChange={(e) => { setForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' })); setSaveSuccess(false); }}
                      className="input-field appearance-none pr-8 capitalize">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                  </div>
                </div>
                <label className="flex items-start gap-3 cursor-pointer select-none pt-5">
                  <input type="checkbox" checked={form.is_self}
                    onChange={(e) => { setForm((f) => ({ ...f, is_self: e.target.checked })); setSaveSuccess(false); }}
                    className="mt-0.5 accent-emerald-400" />
                  <span>
                    <span className="text-sm text-white block">Independent partner (self)</span>
                    <span className="text-xs text-theme-muted">An individual acting as their own partner company.</span>
                  </span>
                </label>
              </div>

              {saveError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                  <AlertCircle size={14} /> {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-xs">
                  <CheckCircle size={14} /> Partner updated.
                </div>
              )}
              <div className="flex justify-end">
                <button type="button" onClick={handleSave} disabled={saving || !form.name.trim()}
                  className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
                  {saving ? <SpinningDots size="sm" className="text-emerald-accent" /> : <CheckCircle size={14} />}
                  Save Changes
                </button>
              </div>

              <div className="border-t border-white/[0.06] pt-4 grid sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Created</span>
                  <span className="text-sm text-white">
                    {new Date(partner.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Partner ID</span>
                  <span className="text-xs text-white font-mono break-all">{partner.id}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Revenue Splits ── */}
          {tab === 'splits' && (
            <div className="p-5 space-y-4">
              <p className="text-xs text-theme-muted">
                Splits apply to partner multilog earnings: worker share is paid to the worker, GS and partner shares are retained.
              </p>

              {arrError ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                  <AlertCircle size={14} /> {arrError}
                </div>
              ) : arrangements === null ? (
                <div className="flex justify-center py-10"><SpinningDots size="md" className="text-emerald-accent" /></div>
              ) : (
                <>
                  {!showArrForm && (
                    <button type="button" onClick={() => setShowArrForm(true)}
                      className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
                      <Plus size={14} /> New Arrangement
                    </button>
                  )}

                  {showArrForm && (
                    <form onSubmit={handleCreateArrangement}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-gold-accent">New Arrangement</p>
                      <div className="grid grid-cols-3 gap-3">
                        {([
                          ['worker_pct', 'Worker %'],
                          ['gs_pct', 'GS %'],
                          ['partner_pct', 'Partner %'],
                        ] as const).map(([key, label]) => (
                          <div key={key}>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">{label}</label>
                            <input type="number" min="0" max="100" step="0.01" required
                              value={arrForm[key]}
                              onChange={(e) => setArrForm((f) => ({ ...f, [key]: e.target.value }))}
                              className={`input-field ${!pctValid && (arrForm.worker_pct || arrForm.gs_pct || arrForm.partner_pct) ? 'border-danger/60' : ''}`}
                              placeholder="0" />
                          </div>
                        ))}
                      </div>
                      <p className={`text-xs font-semibold ${pctValid ? 'text-emerald-accent' : 'text-danger'}`}>
                        Sum: {pctSum.toFixed(2)}% {pctValid ? '✓' : '— must equal exactly 100%'}
                      </p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Effective From</label>
                          <input type="date" required value={arrForm.effective_from}
                            onChange={(e) => setArrForm((f) => ({ ...f, effective_from: e.target.value }))}
                            className="input-field" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Notes</label>
                          <input value={arrForm.notes}
                            onChange={(e) => setArrForm((f) => ({ ...f, notes: e.target.value }))}
                            placeholder="Optional" className="input-field" />
                        </div>
                      </div>
                      {arrSaveError && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                          <AlertCircle size={14} /> {arrSaveError}
                        </div>
                      )}
                      <div className="flex gap-3 justify-end">
                        <button type="button" onClick={() => { setShowArrForm(false); setArrSaveError(null); }}
                          className="btn-secondary text-sm py-2 px-4">Cancel</button>
                        <button type="submit" disabled={arrSaving || !pctValid}
                          className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
                          {arrSaving ? <SpinningDots size="sm" className="text-emerald-accent" /> : <Plus size={14} />}
                          Create
                        </button>
                      </div>
                    </form>
                  )}

                  {sortedArrangements.length === 0 ? (
                    <div className="text-center py-8 text-theme-muted text-sm">
                      No revenue-split arrangements yet. Create one so payroll can split this partner&apos;s multilog earnings.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sortedArrangements.map((a) => {
                        const isCurrent = a.id === currentArrangementId;
                        return (
                          <div key={a.id}
                            className={`rounded-xl border p-4 ${
                              isCurrent
                                ? 'border-emerald-accent/40 bg-emerald-accent/5'
                                : 'border-white/10 bg-white/[0.02]'
                            }`}>
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              {isCurrent && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-accent/20 text-emerald-accent border border-emerald-accent/30">
                                  Current
                                </span>
                              )}
                              <span className="text-xs text-theme-muted">
                                Effective {new Date(a.effective_from).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                {a.effective_to
                                  ? ` → ${new Date(a.effective_to).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
                                  : ' → open-ended'}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              {([
                                ['Worker', a.worker_pct, 'text-emerald-accent'],
                                ['GS', a.gs_pct, 'text-white'],
                                ['Partner', a.partner_pct, 'text-gold-accent'],
                              ] as const).map(([label, pct, cls]) => (
                                <div key={label} className="text-center rounded-lg bg-white/[0.03] border border-white/[0.06] py-2">
                                  <p className={`text-lg font-black ${cls}`}>{pct}%</p>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">{label}</p>
                                </div>
                              ))}
                            </div>
                            {a.notes && <p className="text-xs text-theme-muted mt-3">{a.notes}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Workers ── */}
          {tab === 'workers' && (
            <div className="p-5">
              {workersError ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                  <AlertCircle size={14} /> {workersError}
                </div>
              ) : workers === null ? (
                <div className="flex justify-center py-10"><SpinningDots size="md" className="text-emerald-accent" /></div>
              ) : workers.length === 0 ? (
                <div className="text-center py-10">
                  <Users size={24} className="text-theme-muted mx-auto mb-3" />
                  <p className="text-sm text-white font-medium mb-1">No workers linked yet</p>
                  <p className="text-xs text-theme-muted max-w-sm mx-auto">
                    Workers are linked to this partner from User Management — either during account approval
                    (approve as Partner worker) or by editing an existing worker&apos;s profile.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-theme-muted mb-3">{workers.length} worker{workers.length !== 1 ? 's' : ''} linked to this partner</p>
                  {workers.map((w) => (
                    <div key={w.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white font-medium truncate">{w.display_name}</p>
                        <p className="text-xs text-theme-muted">{w.country || '—'}</p>
                      </div>
                      <StatusBadge status={w.status === 'active' ? 'approved' : 'offline'} label={w.status} />
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        w.work_ready
                          ? 'bg-emerald-accent/20 text-emerald-accent border-emerald-accent/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }`}>
                        {w.work_ready ? 'Cleared' : 'Training'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PartnerManagementPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Partner | null>(null);

  async function loadPartners() {
    setLoading(true); setError(null);
    try { setPartners(await api.get<Partner[]>('/partners')); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load partners.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadPartners(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return partners.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.notes ?? '').toLowerCase().includes(q);
    });
  }, [partners, search, statusFilter]);

  const kpis = useMemo(() => ({
    total: partners.length,
    active: partners.filter((p) => p.status === 'active').length,
    self: partners.filter((p) => p.is_self).length,
    workers: partners.reduce((sum, p) => sum + (p.worker_count ?? 0), 0),
  }), [partners]);

  function handlePartnerUpdated(updated: Partner) {
    setPartners((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelected((prev) => (prev && prev.id === updated.id ? updated : prev));
  }

  const rows = filtered.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    workers: p.worker_count,
    created: new Date(p.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    _partner: p,
  }));

  return (
    <div>
      <PageHeader
        title="Partner Management"
        description="Manage partner companies working with Global Solutions, their revenue-split arrangements, and linked workers."
        actions={
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
            <Plus size={15} /> Add Partner
          </button>
        }
      />
      <AdminSectionTabs tabs={PEOPLE_TABS} />

      <HowPartnersWork />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total Partners" value={kpis.total} icon={Building2} accent="blue" />
        <KpiCard label="Active" value={kpis.active} icon={CheckCircle} accent="emerald" />
        <KpiCard label="Self-Partners" value={kpis.self} icon={UserCheck} accent="gold" />
        <KpiCard label="Partner Workers" value={kpis.workers} icon={Users} accent="emerald" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant" />
          <input
            type="text"
            placeholder="Search partners…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white placeholder:text-theme-muted/60 focus:outline-none focus:border-emerald-accent/40 transition-colors w-56"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-white">
              <X size={12} />
            </button>
          )}
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40 capitalize">
          <option value="">Status: All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span className="text-xs text-theme-muted ml-1">{filtered.length} partner{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: 'name', header: 'Name',
              render: (r) => (
                <span className="flex items-center gap-2">
                  <span className="text-white font-medium">{r.name as string}</span>
                  {(r as typeof rows[number])._partner.is_self && <SelfBadge />}
                </span>
              ),
            },
            {
              key: 'status', header: 'Status',
              render: (r) => <StatusBadge status={r.status === 'active' ? 'approved' : 'offline'} label={r.status as string} />,
            },
            {
              key: 'workers', header: 'Workers',
              render: (r) => (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <Users size={13} className="text-theme-muted" /> {r.workers as number}
                </span>
              ),
            },
            { key: 'created', header: 'Created' },
            {
              key: 'actions', header: '',
              render: (r) => (
                <button type="button"
                  onClick={() => setSelected((r as typeof rows[number])._partner)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                  style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                  <Eye size={14} />
                </button>
              ),
            },
          ]}
          data={rows as unknown as Record<string, unknown>[]}
          emptyMessage="No partners found. Add a partner to manage revenue splits."
        />
      )}

      {showCreate && (
        <CreatePartnerModal
          onClose={() => setShowCreate(false)}
          onCreated={(p) => { setPartners((prev) => [p, ...prev]); setShowCreate(false); }}
        />
      )}
      {selected && (
        <PartnerDetailModal
          partner={selected}
          onClose={() => setSelected(null)}
          onUpdated={handlePartnerUpdated}
        />
      )}
    </div>
  );
}
