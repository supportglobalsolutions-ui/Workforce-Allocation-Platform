'use client';

import Link from 'next/link';
import RecordedCurrencyNote from '@/components/currency/RecordedCurrencyNote';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, Check, ChevronDown, ChevronRight, Clock, ExternalLink, Eye, Plus, Receipt, Share2, Trash2, Undo2, X } from 'lucide-react';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import RecipientPicker, { pctPayload, type RecipientOption, type SplitMode } from '@/components/payroll/RecipientPicker';
import { api } from '@/lib/api';
import { currencyCodes, useCurrencies } from '@/lib/currencies';

export interface LedgerPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
  currency: string;
  is_current?: boolean;
}

interface Member {
  worker_id: string;
  display_name: string;
  public_code: string | null;
  status: string;
  currency: string;
  approved: boolean;
}

interface ApprovalsOut {
  member_approval_required: boolean;
  members: Member[];
}

interface ClientRow {
  client_id: string;
  name: string;
  platform: string;
  contract_status: string;
  amount: string | null;
  shared_cost: string;
}

interface Share {
  kind: 'worker' | 'client' | 'gs';
  recipient_id: string | null;
  name: string;
  pool_pct: string;
  amount_base: string;
  amount_local?: string | null;
  local_currency?: string | null;
}

interface Entry {
  id: string;
  category: string;
  /** The description. */
  title: string;
  notes: string | null;
  total_amount: string;
  currency: string;
  target_field: 'bonus' | 'transfer_cost' | 'external_cost';
  distributed: boolean;
  distributed_at: string | null;
  worker_pool_pct: string;
  gs_pool_pct: string;
  gs_amount: string;
  worker_mode: SplitMode;
  client_mode: SplitMode;
  created_at: string | null;
  shares: Share[];
}

const STANDARD_CATEGORIES = ['Transfer cost', 'External cost'];

const money = (v: string | number | null | undefined) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (v: number) => `${Number(v.toFixed(2))}%`;

const EDITABLE = new Set(['open', 'calculated']);

export function isLedgerEditable(period: LedgerPeriod | null): boolean {
  return !!period && EDITABLE.has(period.status);
}

function Banner({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-sm">
          <Check size={14} /> {notice}
        </div>
      )}
    </>
  );
}

/**
 * The month's costs: record each one (category, description, amount), then
 * distribute it across workers, clients and Global Solutions when ready.
 */
export function SharedCostsSection({ period, onChanged }: { period: LedgerPeriod; onChanged?: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [adding, setAdding] = useState(false);
  const [categories, setCategories] = useState<string[]>(STANDARD_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<ApprovalsOut>(`/member-approvals/periods/${period.id}`),
      api.get<ClientRow[]>(`/cost-ledger/periods/${period.id}/clients`),
      api.get<Entry[]>(`/cost-ledger/periods/${period.id}/entries`),
      api.get<string[]>(`/cost-ledger/periods/${period.id}/categories`).catch(() => STANDARD_CATEGORIES),
    ])
      .then(([a, c, e, cats]) => {
        setMembers(a.members);
        setApprovalRequired(a.member_approval_required);
        setClients(c);
        setEntries(e);
        setCategories(cats.length ? cats : STANDARD_CATEGORIES);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load costs'))
      .finally(() => setLoading(false));
  }, [period.id]);

  useEffect(() => { load(); }, [load]);

  const editable = isLedgerEditable(period);
  const done = (msg: string) => { setNotice(msg); setError(null); load(); onChanged?.(); };
  const fail = (msg: string) => { setError(msg); setNotice(null); };

  const totals = useMemo(() => {
    let all = 0, distributed = 0, pending = 0, gs = 0, pendingCount = 0;
    entries.forEach((e) => {
      const amt = Number(e.total_amount);
      all += amt;
      if (e.distributed) { distributed += amt; gs += Number(e.gs_amount); } else { pending += amt; pendingCount += 1; }
    });
    return { all, distributed, pending, gs, pendingCount };
  }, [entries]);

  if (loading) {
    return <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>;
  }

  const cur = period.currency;
  return (
    <div className="space-y-6">
      <RecordedCurrencyNote />
      <Banner error={error} notice={notice} />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard compact label={`Total costs · ${period.label}`} value={`${cur} ${money(totals.all)}`} icon={Receipt} accent="blue" />
        <KpiCard compact label="Distributed" value={`${cur} ${money(totals.distributed)}`} icon={Share2} accent="emerald" />
        <KpiCard compact label={`Not distributed yet${totals.pendingCount ? ` (${totals.pendingCount})` : ''}`} value={`${cur} ${money(totals.pending)}`} icon={Clock} accent="gold" />
        <KpiCard compact label="Global Solutions bears" value={`${cur} ${money(totals.gs)}`} icon={Building2} accent="blue" />
      </div>

      {!editable && (
        <p className="text-xs text-amber-400">
          {period.label} is {period.status} — reopen it to add, distribute or remove costs.
        </p>
      )}
      {editable && <button type="button" onClick={() => { setError(null); setAdding(true); }} className="btn-primary px-4 py-2 inline-flex items-center gap-2"><Plus size={14} /> Add cost</button>}
      {adding && <AddCostForm period={period} categories={categories} onClose={() => setAdding(false)} onSaved={msg => { setAdding(false); done(msg); }} onError={fail} />}
      <CostsList
        period={period}
        entries={entries}
        editable={editable}
        members={members}
        approvalRequired={approvalRequired}
        clients={clients}
        onChanged={done}
        onError={fail}
      />
    </div>
  );
}

/** Client earnings for the month — the same figures as each client's page on Clients. */
export function ClientEarningsSection({ period, onChanged }: { period: LedgerPeriod; onChanged?: () => void }) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<ClientRow[]>(`/cost-ledger/periods/${period.id}/clients`)
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load client earnings'))
      .finally(() => setLoading(false));
  }, [period.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>;
  }

  return (
    <div className="space-y-4">
      <Banner error={error} notice={notice} />
      <ClientEarnings
        period={period}
        clients={clients}
        onSaved={(msg) => { setNotice(msg); setError(null); load(); onChanged?.(); }}
        onError={(msg) => { setError(msg); setNotice(null); }}
      />
    </div>
  );
}

// ── Recording a cost ────────────────────────────────────────────────────────

const OTHER = '__other__';

function AddCostForm({ period, categories, onSaved, onError, onClose }: {
  onClose: () => void;
  period: LedgerPeriod;
  categories: string[];
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const currencies = useCurrencies();
  const [currency, setCurrency] = useState(period.currency);
  const [formError, setFormError] = useState<string | null>(null);
  const [category, setCategory] = useState(categories[0] ?? 'Transfer cost');
  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const chosen = category === OTHER ? customCategory.trim() : category;

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    try {
      const entry = await api.post<Entry>(`/cost-ledger/periods/${period.id}/entries`, {
        category: chosen,
        description: description.trim(),
        total_amount: Number(total),
        currency,
        notes: notes.trim() || null,
      });
      onSaved(`Added “${entry.title}” (${entry.category}). Distribute it when you're ready.`);
      setDescription(''); setTotal(''); setNotes(''); setCustomCategory('');
      if (category === OTHER) setCategory(entry.category);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the cost.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Add cost" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form onSubmit={save} className="glass-modal w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-4">
      <button type="button" onClick={onClose} disabled={busy} aria-label="Close add cost" className="float-right text-theme-muted"><X size={18} /></button>
      <div>
        <h2 className="text-sm font-bold text-theme-heading flex items-center gap-2"><Plus size={14} /> Add a cost</h2>
        <p className="text-[11px] text-theme-muted mt-1">
          Record what the month cost. Nothing is charged to anyone yet — use <span className="text-theme-heading">Distribute</span> on
          the cost to share it between workers, clients and Global Solutions.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-theme-muted">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field w-full">
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={OTHER}>Other (type a category)…</option>
          </select>
        </label>
        {category === OTHER && (
          <label className="space-y-1">
            <span className="text-xs text-theme-muted">New category</span>
            <input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} maxLength={64}
              placeholder="e.g. Internet" className="input-field w-full" required />
          </label>
        )}
        <label className={`space-y-1 ${category === OTHER ? '' : 'sm:col-span-2'}`}>
          <span className="text-xs text-theme-muted">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255}
            placeholder="e.g. Mobile money fees – October" className="input-field w-full" required />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-theme-muted">Amount</span>
          <input type="number" min="0.01" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)}
            className="input-field w-full tabular-nums" required />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-theme-muted">Currency</span>
        <select value={currency} onChange={e => setCurrency(e.target.value)} className="input-field w-full">
          {currencyCodes(currencies, currency).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {currency !== period.currency && <span className="text-xs text-theme-muted">Converted to {period.currency} using the stored exchange rate.</span>}
      </label>
      {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
      <label className="block space-y-1">
        <span className="text-xs text-theme-muted">Notes (optional)</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field w-full" />
      </label>
      <button type="submit" disabled={busy || !chosen || !description.trim() || !total} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
        {busy ? <SpinningDots size="sm" /> : <Plus size={14} />} Add cost
      </button>
    </form>
    </div>
  );
}

// ── The month's costs ───────────────────────────────────────────────────────

function splitSummary(e: Entry): string {
  const workers = e.shares.filter((s) => s.kind === 'worker').length;
  const clients = e.shares.filter((s) => s.kind === 'client').length;
  const wp = Number(e.worker_pool_pct);
  const gp = Number(e.gs_pool_pct);
  const cp = 100 - wp - gp;
  const parts: string[] = [];
  if (wp > 0) parts.push(`${pct(wp)} to ${workers} worker${workers === 1 ? '' : 's'}`);
  if (cp > 0) parts.push(`${pct(cp)} to ${clients} client${clients === 1 ? '' : 's'}`);
  if (gp > 0) parts.push(`${pct(gp)} to Global Solutions`);
  return parts.join(' · ');
}

function CostsList({
  period, entries, editable, members, approvalRequired, clients, onChanged, onError,
}: {
  period: LedgerPeriod;
  entries: Entry[];
  editable: boolean;
  members: Member[];
  approvalRequired: boolean;
  clients: ClientRow[];
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [distributing, setDistributing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: 'remove' | 'undo' } | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (entry: Entry, action: 'remove' | 'undo') => {
    setBusy(true);
    try {
      if (action === 'remove') {
        await api.delete(`/cost-ledger/entries/${entry.id}`);
        onChanged(entry.distributed
          ? `Removed “${entry.title}” and took its shares back off payslips and clients.`
          : `Removed “${entry.title}”.`);
      } else {
        await api.post(`/cost-ledger/entries/${entry.id}/undistribute`, {});
        onChanged(`Took “${entry.title}” back off payslips and clients. It is still recorded.`);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className="glass-panel overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h2 className="text-sm font-bold text-theme-heading">Costs this month</h2>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-theme-muted text-sm">No costs recorded for {period.label} yet.</p>
      ) : (
        <ul>
          {entries.map((e) => {
            const isOpen = open === e.id;
            const confirming = confirm?.id === e.id ? confirm.action : null;
            return (
              <li key={e.id} className="border-b border-white/[0.04] last:border-0">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {e.distributed ? (
                    <button type="button" onClick={() => setOpen(isOpen ? null : e.id)} className="text-theme-muted" aria-label={isOpen ? 'Hide shares' : 'Show shares'}>
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  ) : <span className="w-4" />}
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted">{e.category}</span>
                      <span className="text-theme-heading font-medium">{e.title}</span>
                    </div>
                    <div className="text-[11px] text-theme-muted mt-0.5">
                      {e.distributed
                        ? <span className="text-emerald-accent">Distributed</span>
                        : <span className="text-amber-400">Not distributed yet</span>}
                      {e.distributed && ` · ${splitSummary(e)}`}
                      {e.notes ? ` · ${e.notes}` : ''}
                    </div>
                  </div>
                  <div className="tabular-nums text-theme-heading font-semibold">{money(e.total_amount)} {e.currency}</div>
                  {editable && (
                    confirming ? (
                      <span className="flex gap-1">
                        <button type="button" disabled={busy} onClick={() => void act(e, confirming)} className="btn-secondary text-xs py-1.5 px-2 text-danger">
                          {confirming === 'remove' ? 'Confirm remove' : 'Confirm undo'}
                        </button>
                        <button type="button" onClick={() => setConfirm(null)} className="btn-secondary text-xs py-1.5 px-2">Cancel</button>
                      </span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {e.distributed ? (
                          <button type="button" onClick={() => setConfirm({ id: e.id, action: 'undo' })} className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1">
                            <Undo2 size={12} /> Undo distribution
                          </button>
                        ) : (
                          <button type="button" onClick={() => setDistributing(distributing === e.id ? null : e.id)} className="btn-primary text-xs py-1.5 px-2.5 inline-flex items-center gap-1">
                            <Share2 size={12} /> {distributing === e.id ? 'Close' : 'Distribute'}
                          </button>
                        )}
                        <button type="button" onClick={() => setConfirm({ id: e.id, action: 'remove' })} className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1 text-danger">
                          <Trash2 size={12} /> Remove
                        </button>
                      </span>
                    )
                  )}
                </div>
                {isOpen && e.distributed && (
                  <div className="px-4 pb-4">
                    <SharesTable shares={e.shares} currency={e.currency} />
                  </div>
                )}
                {distributing === e.id && !e.distributed && editable && (
                  <div className="px-4 pb-4">
                    <DistributePanel
                      entry={e}
                      members={members}
                      approvalRequired={approvalRequired}
                      clients={clients}
                      onDone={(msg) => { setDistributing(null); onChanged(msg); }}
                      onError={onError}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Distributing a cost ─────────────────────────────────────────────────────

function DistributePanel({ entry, members, approvalRequired, clients, onDone, onError }: {
  entry: Entry;
  members: Member[];
  approvalRequired: boolean;
  clients: ClientRow[];
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  // Who "all workers" means: approved members when the month needs approval.
  const eligibleIds = useMemo(
    () => members.filter((m) => m.status === 'active' && (!approvalRequired || m.approved)).map((m) => m.worker_id),
    [members, approvalRequired],
  );
  const activeClientIds = useMemo(
    () => clients.filter((c) => c.contract_status === 'active').map((c) => c.client_id),
    [clients],
  );

  const [workerPct, setWorkerPct] = useState('100');
  const [gsPct, setGsPct] = useState('0');
  const [workers, setWorkers] = useState<Set<string>>(new Set(eligibleIds));
  const [workerMode, setWorkerMode] = useState<SplitMode>('equal');
  const [workerPcts, setWorkerPcts] = useState<Record<string, string>>({});
  const [clientSel, setClientSel] = useState<Set<string>>(new Set(activeClientIds));
  const [clientMode, setClientMode] = useState<SplitMode>('equal');
  const [clientPcts, setClientPcts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Share[] | null>(null);
  const [busy, setBusy] = useState(false);

  const clamp = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
  const wp = clamp(workerPct);
  const gp = clamp(gsPct);
  const cp = Math.round((100 - wp - gp) * 100) / 100;
  const over = cp < 0;
  const total = Number(entry.total_amount);

  const preset = (w: number, g: number) => { setWorkerPct(String(w)); setGsPct(String(g)); setPreview(null); };

  const workerItems: RecipientOption[] = members.map((m) => ({
    id: m.worker_id,
    name: m.display_name,
    sub: [m.public_code, m.currency, m.status !== 'active' ? m.status : null].filter(Boolean).join(' · '),
    badge: approvalRequired
      ? m.approved ? { label: 'Approved', tone: 'ok' } : { label: 'Unapproved', tone: 'warn' }
      : undefined,
  }));
  const clientItems: RecipientOption[] = clients.map((c) => ({
    id: c.client_id,
    name: c.name,
    sub: [c.platform, c.contract_status !== 'active' ? c.contract_status : null].filter(Boolean).join(' · '),
  }));

  const payload = () => ({
    worker_pool_pct: wp,
    gs_pool_pct: gp,
    worker_ids: wp > 0 ? Array.from(workers) : [],
    worker_mode: workerMode,
    worker_pcts: wp > 0 ? pctPayload(workerMode, workers, workerPcts) : undefined,
    client_ids: cp > 0 ? Array.from(clientSel) : [],
    client_mode: clientMode,
    client_pcts: cp > 0 ? pctPayload(clientMode, clientSel, clientPcts) : undefined,
  });

  const runPreview = async () => {
    setBusy(true);
    try {
      setPreview(await api.post<Share[]>(`/cost-ledger/entries/${entry.id}/preview`, payload()));
    } catch (e) {
      setPreview(null);
      onError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const saved = await api.post<Entry>(`/cost-ledger/entries/${entry.id}/distribute`, payload());
      onDone(`Distributed “${saved.title}”: ${splitSummary(saved)}.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not distribute the cost.');
    } finally {
      setBusy(false);
    }
  };

  const pool = (label: string, p: number) => (
    <span className="text-[11px] text-theme-muted tabular-nums">{label}: {entry.currency} {money((total * p) / 100)}</span>
  );

  return (
    <div className="rounded-xl border border-emerald-accent/20 bg-emerald-accent/[0.03] p-4 space-y-4">
      <div>
        <p className="text-sm font-bold text-theme-heading">Distribute {money(total)} {entry.currency}</p>
        <p className="text-[11px] text-theme-muted mt-0.5">
          Workers&apos; shares go on their payslip as {entry.target_field === 'transfer_cost' ? 'a transfer cost' : 'an external cost'} and
          lower their final net. Clients&apos; shares come off that client&apos;s earnings before the split with recipients.
          Global Solutions&apos; share is a GS expense.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs text-theme-muted">Workers %</span>
            <input type="number" min={0} max={100} step="0.01" value={workerPct} onChange={(e) => { setWorkerPct(e.target.value); setPreview(null); }} className="input-field w-24 py-1 text-right tabular-nums" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-theme-muted">Global Solutions %</span>
            <input type="number" min={0} max={100} step="0.01" value={gsPct} onChange={(e) => { setGsPct(e.target.value); setPreview(null); }} className="input-field w-24 py-1 text-right tabular-nums" />
          </label>
          <div className="space-y-1">
            <span className="block text-xs text-theme-muted">Clients % (the rest)</span>
            <span className={`block py-1 text-sm tabular-nums ${over ? 'text-danger' : 'text-theme-heading'}`}>{pct(cp)}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {([['All workers', 100, 0], ['All clients', 0, 0], ['All Global Solutions', 0, 100], ['50 / 50 workers–clients', 50, 0]] as const).map(([label, w, g]) => (
              <button key={label} type="button" onClick={() => preset(w, g)} className="btn-secondary text-[11px] py-1 px-2">{label}</button>
            ))}
          </div>
        </div>
        {over ? (
          <p className="text-[11px] text-danger">Workers and Global Solutions add up to more than 100%.</p>
        ) : (
          <div className="flex flex-wrap gap-x-4">
            {wp > 0 && pool('Workers', wp)}
            {cp > 0 && pool('Clients', cp)}
            {gp > 0 && pool('Global Solutions', gp)}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {wp > 0 && (
          <RecipientPicker
            title="Workers"
            items={workerItems}
            selected={workers}
            onSelectedChange={(s) => { setWorkers(s); setPreview(null); }}
            mode={workerMode}
            onModeChange={(m) => { setWorkerMode(m); setPreview(null); }}
            pcts={workerPcts}
            onPctsChange={(p) => { setWorkerPcts(p); setPreview(null); }}
            quickSelects={[{ label: approvalRequired ? 'All approved' : 'All active', ids: eligibleIds }]}
            emptyText="No workers yet."
          />
        )}
        {cp > 0 && (
          <RecipientPicker
            title="Clients"
            items={clientItems}
            selected={clientSel}
            onSelectedChange={(s) => { setClientSel(s); setPreview(null); }}
            mode={clientMode}
            onModeChange={(m) => { setClientMode(m); setPreview(null); }}
            pcts={clientPcts}
            onPctsChange={(p) => { setClientPcts(p); setPreview(null); }}
            quickSelects={[{ label: 'All active clients', ids: activeClientIds }]}
            emptyText="No clients yet."
          />
        )}
      </div>

      {preview && <SharesTable shares={preview} currency={entry.currency} />}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || over} onClick={() => void runPreview()} className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
          <Eye size={14} /> Preview
        </button>
        <button type="button" disabled={busy || over} onClick={() => void apply()} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
          {busy ? <SpinningDots size="sm" /> : <Check size={14} />} Distribute
        </button>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<Share['kind'], string> = { worker: 'Worker', client: 'Client', gs: 'Global Solutions' };

function SharesTable({ shares, currency }: { shares: Share[]; currency: string }) {
  const sum = shares.reduce((s, x) => s + Number(x.amount_base), 0);
  return (
    <div className="rounded-xl border border-white/10 overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {['Who', 'Type', 'Share of pool', `Amount (${currency})`, 'On payslip'].map((h, i) => (
              <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase text-theme-muted ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shares.map((s) => (
            <tr key={`${s.kind}-${s.recipient_id ?? 'gs'}`} className="border-b border-white/[0.04] last:border-0">
              <td className="px-3 py-1.5 text-theme-heading">{s.name}</td>
              <td className="px-3 py-1.5 text-theme-muted">{KIND_LABEL[s.kind]}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-theme-muted">{s.kind === 'gs' ? '—' : `${Number(s.pool_pct).toFixed(2)}%`}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(s.amount_base)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-theme-muted">
                {s.amount_local != null ? `− ${money(s.amount_local)} ${s.local_currency}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/10">
            <td colSpan={3} className="px-3 py-2 text-xs text-theme-muted">Total</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(sum)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Client earnings ─────────────────────────────────────────────────────────

function ClientEarnings({
  period,
  clients,
  onSaved,
  onError,
}: {
  period: LedgerPeriod;
  clients: ClientRow[];
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [showSplit, setShowSplit] = useState(false);
  const [total, setTotal] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<SplitMode>('equal');
  const [pcts, setPcts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next: Record<string, string> = {};
    clients.forEach((c) => { next[c.client_id] = c.amount ?? ''; });
    setAmounts(next);
  }, [clients]);

  const changed = clients.filter((c) => (amounts[c.client_id] ?? '') !== (c.amount ?? '') && amounts[c.client_id] !== '');

  const savePerClient = async () => {
    setBusy(true);
    try {
      const body: Record<string, number> = {};
      changed.forEach((c) => { body[c.client_id] = Number(amounts[c.client_id]); });
      const res = await api.put<{ updated: number }>(`/cost-ledger/periods/${period.id}/clients`, { amounts: body });
      onSaved(`Saved earnings for ${res.updated} client${res.updated === 1 ? '' : 's'}.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const saveSplit = async () => {
    setBusy(true);
    try {
      const res = await api.put<{ updated: number }>(`/cost-ledger/periods/${period.id}/clients`, {
        total_amount: Number(total),
        client_ids: Array.from(sel),
        mode,
        pcts: pctPayload(mode, sel, pcts),
      });
      onSaved(`Split ${money(total)} USD across ${res.updated} client${res.updated === 1 ? '' : 's'}.`);
      setTotal('');
      setShowSplit(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Split failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-white/[0.06]">
        <div>
          <h2 className="text-sm font-bold text-theme-heading">Client income this month</h2>
          <p className="text-[11px] text-theme-muted">
            What each client account paid, in USD. Usually one amount per client; use “Split a total” when you only
            have the combined figure. Each amount is saved as a client payout on the Income tab and is the client&apos;s
            revenue on the Client ledger.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/clients" className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5">
            <ExternalLink size={12} /> Clients page
          </Link>
          <Link
            href={`/admin/clients/ledger?period=${period.id}`}
            title="Hours, revenue, costs and the client split for every client"
            className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
          >
            <ExternalLink size={12} /> Client ledger
          </Link>
          <button type="button" onClick={() => setShowSplit((v) => !v)} className="btn-secondary text-xs py-1.5 px-3">
            {showSplit ? 'Close split' : 'Split a total'}
          </button>
        </div>
      </div>

      {showSplit && (
        <div className="p-4 space-y-4 border-b border-white/[0.06]">
          <label className="flex items-center gap-2 text-sm">
            Total (USD)
            <input type="number" min="0.01" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} className="input-field w-40" />
          </label>
          <RecipientPicker
            title="Clients"
            items={clients.map((c) => ({ id: c.client_id, name: c.name, sub: c.platform }))}
            selected={sel}
            onSelectedChange={setSel}
            mode={mode}
            onModeChange={setMode}
            pcts={pcts}
            onPctsChange={setPcts}
            quickSelects={[{ label: 'All active', ids: clients.filter((c) => c.contract_status === 'active').map((c) => c.client_id) }]}
          />
          <button type="button" disabled={busy || !total || !sel.size} onClick={() => void saveSplit()} className="btn-primary text-sm py-2 px-4">
            Apply split to earnings
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-theme-muted">Client</th>
              <th className="text-right px-4 py-2 text-[10px] font-bold uppercase text-theme-muted">Received (USD)</th>
              <th className="text-right px-4 py-2 text-[10px] font-bold uppercase text-theme-muted">Shared costs</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-theme-muted">No clients yet.</td></tr>
            ) : clients.map((c) => (
              <tr key={c.client_id} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-2">
                  <Link href={`/admin/clients?client=${c.client_id}`} className="text-theme-heading hover:text-emerald-accent hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-[11px] text-theme-muted">{c.platform}</div>
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={amounts[c.client_id] ?? ''}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [c.client_id]: e.target.value }))}
                    placeholder="—"
                    className="input-field w-36 text-right py-1"
                  />
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-theme-muted">
                  {Number(c.shared_cost) > 0 ? `− ${money(c.shared_cost)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {clients.length > 0 && (
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <button type="button" disabled={busy || !changed.length} onClick={() => void savePerClient()} className="btn-primary text-sm py-2 px-4">
            Save {changed.length || ''} changed amount{changed.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  );
}
