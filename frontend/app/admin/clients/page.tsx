'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Briefcase, Eye, FileCheck, Link2, Monitor, Percent, Plus, Search, Trash2, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

type OwnerType = 'gs' | 'worker' | 'partner_entity';
type ContractStatus = 'active' | 'paused' | 'ended';

interface Client {
  id: string;
  name: string;
  platform: string;
  account_email: string | null;
  account_id: string | null;
  login_reference: string | null;
  owner_type: OwnerType;
  owner_worker_id: string | null;
  owner_partner_entity_id: string | null;
  contract_status: ContractStatus;
  notes: string | null;
  document_urls: string[];
  created_at: string;
  updated_at: string;
  owner_name: string | null;
  rdp_count: number;
}

interface Agreement {
  id: string;
  client_id: string;
  gs_pct: number;
  owner_pct: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
}

interface ClientRdp {
  id: string;
  nickname: string;
  country: string;
  status: string;
  assigned_worker_id: string | null;
  assigned_worker_name: string | null;
}

interface WorkerOption { id: string; display_name: string; }
interface PartnerOption { id: string; name: string; }

// ── Helpers ────────────────────────────────────────────────────────────────────

const PLATFORM_SUGGESTIONS = ['Outlier', 'Alignerr', 'DataAnnotation', 'Appen', 'Scale AI', 'Invisible', 'Other'];

const OWNER_LABELS: Record<OwnerType, string> = {
  gs: 'GS',
  worker: 'Worker',
  partner_entity: 'Partner',
};

const OWNER_CHIP: Record<OwnerType, string> = {
  gs: 'bg-emerald-accent/20 text-emerald-accent border-emerald-accent/30',
  worker: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  partner_entity: 'bg-gold-accent/20 text-gold-accent border-gold-accent/30',
};

const CONTRACT_BADGE: Record<ContractStatus, string> = {
  active: 'approved',
  paused: 'pending',
  ended: 'offline',
};

function OwnerTypeChip({ type }: { type: OwnerType }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${OWNER_CHIP[type]}`}>
      {OWNER_LABELS[type]}
    </span>
  );
}

// ── Client form (shared by create + edit) ──────────────────────────────────────

interface ClientFormState {
  name: string;
  platform: string;
  account_email: string;
  account_id: string;
  login_reference: string;
  owner_type: OwnerType;
  owner_worker_id: string;
  owner_partner_entity_id: string;
  contract_status: ContractStatus;
  notes: string;
  document_urls: string[];
}

const EMPTY_FORM: ClientFormState = {
  name: '',
  platform: '',
  account_email: '',
  account_id: '',
  login_reference: '',
  owner_type: 'gs',
  owner_worker_id: '',
  owner_partner_entity_id: '',
  contract_status: 'active',
  notes: '',
  document_urls: [],
};

function formFromClient(c: Client): ClientFormState {
  return {
    name: c.name,
    platform: c.platform,
    account_email: c.account_email ?? '',
    account_id: c.account_id ?? '',
    login_reference: c.login_reference ?? '',
    owner_type: c.owner_type,
    owner_worker_id: c.owner_worker_id ?? '',
    owner_partner_entity_id: c.owner_partner_entity_id ?? '',
    contract_status: c.contract_status,
    notes: c.notes ?? '',
    document_urls: c.document_urls ?? [],
  };
}

function ClientForm({
  clientId,
  initial,
  submitLabel,
  onSaved,
  onCancel,
}: {
  clientId?: string;
  initial: ClientFormState;
  submitLabel: string;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<ClientFormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workers, setWorkers] = useState<WorkerOption[] | null>(null);
  const [partners, setPartners] = useState<PartnerOption[] | null>(null);

  useEffect(() => {
    if (form.owner_type === 'worker' && workers === null) {
      api.get<WorkerOption[]>('/workers').then(setWorkers).catch(() => setWorkers([]));
    }
    if (form.owner_type === 'partner_entity' && partners === null) {
      api.get<PartnerOption[]>('/partners').then(setPartners).catch(() => setPartners([]));
    }
  }, [form.owner_type, workers, partners]);

  const set = <K extends keyof ClientFormState>(key: K, value: ClientFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      platform: form.platform.trim(),
      account_email: form.account_email.trim() || null,
      account_id: form.account_id.trim() || null,
      login_reference: form.login_reference.trim() || null,
      owner_type: form.owner_type,
      owner_worker_id: form.owner_type === 'worker' ? form.owner_worker_id || null : null,
      owner_partner_entity_id: form.owner_type === 'partner_entity' ? form.owner_partner_entity_id || null : null,
      contract_status: form.contract_status,
      notes: form.notes.trim() || null,
      document_urls: form.document_urls.map((u) => u.trim()).filter(Boolean),
    };
    try {
      if (clientId) await api.patch<Client>(`/clients/${clientId}`, payload);
      else await api.post<Client>('/clients', payload);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save client.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Name *</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Outlier — Account 3" className="input-field" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Platform *</label>
          <input required list="client-platform-suggestions" value={form.platform}
            onChange={(e) => set('platform', e.target.value)} placeholder="Outlier" className="input-field" />
          <datalist id="client-platform-suggestions">
            {PLATFORM_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Account Email</label>
          <input type="email" value={form.account_email} onChange={(e) => set('account_email', e.target.value)}
            placeholder="account@platform.com" className="input-field" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Account ID</label>
          <input value={form.account_id} onChange={(e) => set('account_id', e.target.value)}
            placeholder="Platform account identifier" className="input-field" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Login Reference</label>
          <input value={form.login_reference} onChange={(e) => set('login_reference', e.target.value)}
            placeholder="Where credentials are kept (vault entry, doc, etc.)" className="input-field" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Owner</label>
          <select value={form.owner_type} onChange={(e) => set('owner_type', e.target.value as OwnerType)} className="input-field">
            <option value="gs">Global Solutions</option>
            <option value="worker">Worker</option>
            <option value="partner_entity">Partner company</option>
          </select>
        </div>
        {form.owner_type === 'worker' && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Owner Worker *</label>
            {workers === null ? (
              <div className="py-2"><SpinningDots size="sm" className="text-emerald-accent" /></div>
            ) : (
              <select required value={form.owner_worker_id} onChange={(e) => set('owner_worker_id', e.target.value)} className="input-field">
                <option value="">Select worker…</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.display_name}</option>)}
              </select>
            )}
          </div>
        )}
        {form.owner_type === 'partner_entity' && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Owner Partner *</label>
            {partners === null ? (
              <div className="py-2"><SpinningDots size="sm" className="text-emerald-accent" /></div>
            ) : (
              <select required value={form.owner_partner_entity_id} onChange={(e) => set('owner_partner_entity_id', e.target.value)} className="input-field">
                <option value="">Select partner…</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
        )}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Contract Status</label>
          <select value={form.contract_status} onChange={(e) => set('contract_status', e.target.value as ContractStatus)} className="input-field">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Notes</label>
          <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)}
            placeholder="Internal notes about this client account" className="input-field resize-y" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Documents</label>
          <p className="text-xs text-theme-muted mb-2">Paste Firebase Storage or Drive links.</p>
          <div className="space-y-2">
            {form.document_urls.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={url}
                  onChange={(e) => set('document_urls', form.document_urls.map((u, j) => (j === i ? e.target.value : u)))}
                  placeholder="https://…" className="input-field flex-1" />
                <button type="button"
                  onClick={() => set('document_urls', form.document_urls.filter((_, j) => j !== i))}
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-theme-muted hover:text-danger transition-colors border border-white/10">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => set('document_urls', [...form.document_urls, ''])}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
              <Plus size={12} /> Add link
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary text-sm py-2 px-4">Cancel</button>}
        <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
          {saving && <SpinningDots size="sm" className="text-emerald-accent" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// ── Revenue sharing tab ────────────────────────────────────────────────────────

function AgreementsTab({ clientId }: { clientId: string }) {
  const [agreements, setAgreements] = useState<Agreement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [gsPct, setGsPct] = useState('40');
  const [ownerPct, setOwnerPct] = useState('60');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () => {
    api.get<Agreement[]>(`/clients/${clientId}/agreements`)
      .then((rows) => setAgreements([...rows].sort((a, b) => b.effective_from.localeCompare(a.effective_from))))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load agreements'));
  };

  useEffect(load, [clientId]);

  const sumOk = Number(gsPct) + Number(ownerPct) === 100;

  const today = new Date().toISOString().slice(0, 10);
  const currentId = agreements?.find(
    (a) => a.effective_from <= today && (!a.effective_to || a.effective_to >= today),
  )?.id;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!sumOk) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.post<Agreement>('/clients/agreements', {
        client_id: clientId,
        gs_pct: Number(gsPct),
        owner_pct: Number(ownerPct),
        effective_from: effectiveFrom,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      setShowForm(false);
      setNotes('');
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to create agreement.');
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="text-danger text-sm">{error}</p>;
  if (agreements === null) return <div className="flex justify-center py-8"><SpinningDots size="md" className="text-emerald-accent" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-theme-muted">
        Splits are applied to client earnings after worker costs are deducted. Example: GS 40% / Owner 60%.
      </p>

      <div className="flex justify-end">
        <button type="button" onClick={() => setShowForm((v) => !v)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? 'Cancel' : 'New agreement'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">GS %</label>
              <input type="number" min={0} max={100} required value={gsPct} onChange={(e) => setGsPct(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Owner %</label>
              <input type="number" min={0} max={100} required value={ownerPct} onChange={(e) => setOwnerPct(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Effective From</label>
              <input type="date" required value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="input-field" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="input-field" />
          </div>
          {!sumOk && (
            <p className="text-xs text-danger flex items-center gap-1.5">
              <AlertCircle size={12} /> GS % and Owner % must sum to 100 (currently {Number(gsPct) + Number(ownerPct)}).
            </p>
          )}
          {formError && <p className="text-xs text-danger">{formError}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving || !sumOk} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving && <SpinningDots size="sm" className="text-emerald-accent" />}
              Create agreement
            </button>
          </div>
        </form>
      )}

      {agreements.length === 0 ? (
        <p className="text-theme-muted text-sm py-4 text-center">No revenue-sharing agreements yet.</p>
      ) : (
        <div className="space-y-2">
          {agreements.map((a) => {
            const isCurrent = a.id === currentId;
            return (
              <div key={a.id}
                className={`rounded-xl border p-4 ${isCurrent ? 'border-emerald-accent/40 bg-emerald-accent/5' : 'border-white/10 bg-white/[0.02]'}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Percent size={14} className={isCurrent ? 'text-emerald-accent' : 'text-theme-muted'} />
                    <span className="text-sm font-bold text-white">GS {a.gs_pct}% / Owner {a.owner_pct}%</span>
                    {isCurrent && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-emerald-accent/20 text-emerald-accent border-emerald-accent/30">
                        Current
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-theme-muted">
                    {new Date(a.effective_from).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    {' → '}
                    {a.effective_to
                      ? new Date(a.effective_to).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                      : 'ongoing'}
                  </span>
                </div>
                {a.notes && <p className="text-xs text-theme-muted mt-2">{a.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Linked RDPs tab ────────────────────────────────────────────────────────────

function LinkedRdpsTab({ clientId }: { clientId: string }) {
  const [rdps, setRdps] = useState<ClientRdp[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ClientRdp[]>(`/clients/${clientId}/rdps`)
      .then(setRdps)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load RDPs'));
  }, [clientId]);

  if (error) return <p className="text-danger text-sm">{error}</p>;
  if (rdps === null) return <div className="flex justify-center py-8"><SpinningDots size="md" className="text-emerald-accent" /></div>;
  if (rdps.length === 0) {
    return (
      <div className="text-center py-8">
        <Monitor size={24} className="mx-auto text-theme-muted mb-3" />
        <p className="text-theme-muted text-sm">Link RDPs to this client from the RDP Resources page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rdps.map((r) => (
        <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-bold text-white">{r.nickname}</p>
            <p className="text-xs text-theme-muted">
              {r.country}
              {r.assigned_worker_name ? ` · ${r.assigned_worker_name}` : ''}
            </p>
          </div>
          <StatusBadge status={r.status} />
        </div>
      ))}
    </div>
  );
}

// ── Detail modal ───────────────────────────────────────────────────────────────

type DetailTab = 'details' | 'revenue' | 'rdps';

function ClientDetailModal({ client, onClose, onUpdated }: { client: Client; onClose: () => void; onUpdated: () => void }) {
  const [tab, setTab] = useState<DetailTab>('details');

  const TABS: { key: DetailTab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'revenue', label: 'Revenue Sharing' },
    { key: 'rdps', label: 'Linked RDPs' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">{client.name}</h2>
            <p className="text-xs text-theme-muted mt-0.5">{client.platform}{client.owner_name ? ` · ${client.owner_name}` : ''}</p>
          </div>
          <button type="button" onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-white/[0.06] px-5 shrink-0">
          {TABS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                tab === key ? 'text-emerald-400 border-emerald-400' : 'text-theme-muted border-transparent hover:text-white'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {tab === 'details' && (
            <ClientForm clientId={client.id} initial={formFromClient(client)} submitLabel="Save" onSaved={onUpdated} />
          )}
          {tab === 'revenue' && <AgreementsTab clientId={client.id} />}
          {tab === 'rdps' && <LinkedRdpsTab clientId={client.id} />}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ClientManagementPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setClients(await api.get<Client[]>('/clients'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load clients.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const platforms = useMemo(
    () => Array.from(new Set(clients.map((c) => c.platform))).sort(),
    [clients],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (platformFilter && c.platform !== platformFilter) return false;
      if (statusFilter && c.contract_status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.platform.toLowerCase().includes(q) ||
        (c.account_email ?? '').toLowerCase().includes(q) ||
        (c.owner_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [clients, search, platformFilter, statusFilter]);

  const totalRdps = clients.reduce((sum, c) => sum + (c.rdp_count ?? 0), 0);
  const activeCount = clients.filter((c) => c.contract_status === 'active').length;

  const selectedClient = selectedId ? clients.find((c) => c.id === selectedId) ?? null : null;

  const rows = filtered.map((c) => ({ id: c.id, _client: c }));

  return (
    <div>
      <PageHeader
        title="Client Management"
        description="Managed client accounts on external platforms — ownership, contracts, revenue splits, and linked RDPs."
        actions={
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
            <Plus size={15} /> Add Client
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Total Clients" value={clients.length} icon={Briefcase} accent="emerald" />
        <KpiCard label="Active Contracts" value={activeCount} icon={FileCheck} accent="gold" />
        <KpiCard label="Linked RDPs" value={totalRdps} icon={Link2} accent="blue" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant" />
          <input
            type="text"
            placeholder="Search name, email, owner…"
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
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}
          className="px-3 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40">
          <option value="">Platform: All</option>
          {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40 capitalize">
          <option value="">Contract: All</option>
          {(['active', 'paused', 'ended'] as const).map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <span className="text-xs text-theme-muted ml-1">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</span>
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
              render: (r) => <span className="font-medium text-white">{(r._client as Client).name}</span>,
            },
            { key: 'platform', header: 'Platform', render: (r) => (r._client as Client).platform },
            {
              key: 'account', header: 'Account',
              render: (r) => {
                const c = r._client as Client;
                return (
                  <div>
                    <p className="text-sm">{c.account_email ?? '—'}</p>
                    {c.account_id && <p className="text-xs text-theme-muted font-mono">{c.account_id}</p>}
                  </div>
                );
              },
            },
            {
              key: 'owner', header: 'Owner',
              render: (r) => {
                const c = r._client as Client;
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{c.owner_name ?? (c.owner_type === 'gs' ? 'Global Solutions' : '—')}</span>
                    <OwnerTypeChip type={c.owner_type} />
                  </div>
                );
              },
            },
            {
              key: 'contract', header: 'Contract',
              render: (r) => {
                const c = r._client as Client;
                return <StatusBadge status={CONTRACT_BADGE[c.contract_status]} label={c.contract_status} />;
              },
            },
            { key: 'rdps', header: 'RDPs', render: (r) => (r._client as Client).rdp_count ?? 0 },
            {
              key: 'actions', header: '',
              render: (r) => (
                <button type="button" onClick={() => setSelectedId((r._client as Client).id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                  style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                  <Eye size={14} />
                </button>
              ),
            },
          ]}
          data={rows as unknown as Record<string, unknown>[]}
          emptyMessage="No clients found. Click “Add Client” to create one."
        />
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06] shrink-0">
              <h2 className="text-base font-bold text-white">New Client</h2>
              <button type="button" onClick={() => setShowCreate(false)}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <ClientForm
                initial={EMPTY_FORM}
                submitLabel="Create Client"
                onCancel={() => setShowCreate(false)}
                onSaved={() => { setShowCreate(false); load(); }}
              />
            </div>
          </div>
        </div>
      )}

      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          onClose={() => setSelectedId(null)}
          onUpdated={() => load()}
        />
      )}
    </div>
  );
}
