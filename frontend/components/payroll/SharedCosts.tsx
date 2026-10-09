'use client';

import Link from 'next/link';
import RecordedCurrencyNote from '@/components/currency/RecordedCurrencyNote';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronRight, ExternalLink, Eye, Plus, Trash2 } from 'lucide-react';
import SpinningDots from '@/components/shared/SpinningDots';
import RecipientPicker, { pctPayload, type RecipientOption, type SplitMode } from '@/components/payroll/RecipientPicker';
import { api } from '@/lib/api';

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
  kind: 'worker' | 'client';
  recipient_id: string;
  name: string;
  pool_pct: string;
  amount_base: string;
  amount_local?: string | null;
  local_currency?: string | null;
}

interface Entry {
  id: string;
  title: string;
  notes: string | null;
  total_amount: string;
  currency: string;
  target_field: TargetField;
  worker_pool_pct: string;
  worker_mode: SplitMode;
  client_mode: SplitMode;
  created_at: string | null;
  shares: Share[];
}

type TargetField = 'bonus' | 'transfer_cost' | 'external_cost';

const FIELD_LABELS: Record<TargetField, string> = {
  bonus: 'Bonus (adds to pay)',
  transfer_cost: 'Transfer cost (deduction)',
  external_cost: 'External cost (deduction)',
};

const money = (v: string | number | null | undefined) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

/** Shared costs: enter once, split across workers and clients. Worker shares land on payslips. */
export function SharedCostsSection({ period, onChanged }: { period: LedgerPeriod; onChanged?: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<ApprovalsOut>(`/member-approvals/periods/${period.id}`),
      api.get<ClientRow[]>(`/cost-ledger/periods/${period.id}/clients`),
      api.get<Entry[]>(`/cost-ledger/periods/${period.id}/entries`),
    ])
      .then(([a, c, e]) => {
        setMembers(a.members);
        setApprovalRequired(a.member_approval_required);
        setClients(c);
        setEntries(e);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shared costs'))
      .finally(() => setLoading(false));
  }, [period.id]);

  useEffect(() => { load(); }, [load]);

  const editable = isLedgerEditable(period);
  const done = (msg: string) => { setNotice(msg); setError(null); load(); onChanged?.(); };
  const fail = (msg: string) => { setError(msg); setNotice(null); };

  if (loading) {
    return <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>;
  }

  return (
    <div className="space-y-6">
      <RecordedCurrencyNote />
      <Banner error={error} notice={notice} />
      {!editable && (
        <p className="text-xs text-amber-400">
          {period.label} is {period.status} — reopen it to add or remove shared costs.
        </p>
      )}
      {editable && (
        <NewEntryForm
          period={period}
          members={members}
          approvalRequired={approvalRequired}
          clients={clients}
          onSaved={done}
          onError={fail}
        />
      )}
      <EntriesList entries={entries} editable={editable} onDeleted={done} onError={fail} />
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

// ── New entry ───────────────────────────────────────────────────────────────

function NewEntryForm({
  period,
  members,
  approvalRequired,
  clients,
  onSaved,
  onError,
}: {
  period: LedgerPeriod;
  members: Member[];
  approvalRequired: boolean;
  clients: ClientRow[];
  onSaved: (msg: string) => void;
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

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [total, setTotal] = useState('');
  const [field, setField] = useState<TargetField>('external_cost');
  const [workerPct, setWorkerPct] = useState('100');
  const [workers, setWorkers] = useState<Set<string>>(new Set(eligibleIds));
  const [workerMode, setWorkerMode] = useState<SplitMode>('equal');
  const [workerPcts, setWorkerPcts] = useState<Record<string, string>>({});
  const [clientSel, setClientSel] = useState<Set<string>>(new Set());
  const [clientMode, setClientMode] = useState<SplitMode>('equal');
  const [clientPcts, setClientPcts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Share[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setWorkers(new Set(eligibleIds)); }, [eligibleIds]);

  const wp = Math.min(100, Math.max(0, Number(workerPct) || 0));
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
    total_amount: Number(total),
    worker_pool_pct: wp,
    worker_ids: wp > 0 ? Array.from(workers) : [],
    worker_mode: workerMode,
    worker_pcts: wp > 0 ? pctPayload(workerMode, workers, workerPcts) : undefined,
    client_ids: wp < 100 ? Array.from(clientSel) : [],
    client_mode: clientMode,
    client_pcts: wp < 100 ? pctPayload(clientMode, clientSel, clientPcts) : undefined,
  });

  const runPreview = async () => {
    setBusy(true);
    try {
      setPreview(await api.post<Share[]>(`/cost-ledger/periods/${period.id}/preview`, payload()));
    } catch (e) {
      setPreview(null);
      onError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const entry = await api.post<Entry>(`/cost-ledger/periods/${period.id}/entries`, {
        ...payload(),
        title,
        notes: notes || null,
        target_field: field,
      });
      onSaved(`“${entry.title}” split across ${entry.shares.length} recipient${entry.shares.length === 1 ? '' : 's'}.`);
      setTitle(''); setNotes(''); setTotal(''); setPreview(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="glass-panel p-5 space-y-5">
      <div>
        <h2 className="text-sm font-bold text-theme-heading flex items-center gap-2"><Plus size={14} /> New shared cost</h2>
        <p className="text-[11px] text-theme-muted mt-1">
          Enter a cost once and split it across workers and clients — equally or by %. Worker shares land on their
          payslip; client shares come off that client&apos;s earnings before the GS / owner split.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 lg:col-span-2">
          <span className="text-xs text-theme-muted">What is it?</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Internet – October" className="input-field w-full" required />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-theme-muted">Total ({period.currency})</span>
          <input type="number" min="0.01" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} className="input-field w-full" required />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-theme-muted">Payslip field for workers</span>
          <select value={field} onChange={(e) => setField(e.target.value as TargetField)} className="input-field w-full">
            {(Object.keys(FIELD_LABELS) as TargetField[]).map((f) => (
              <option key={f} value={f}>{FIELD_LABELS[f]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-theme-muted">Split between</span>
          <label className="flex items-center gap-2 text-sm">
            Workers
            <input type="number" min={0} max={100} step="0.01" value={workerPct} onChange={(e) => setWorkerPct(e.target.value)} className="input-field w-20 py-1 text-right" />
            %
          </label>
          <span className="text-sm text-theme-muted">Clients {(100 - wp).toFixed(2)}%</span>
          <div className="flex gap-1">
            {[['All workers', 100], ['50 / 50', 50], ['All clients', 0]].map(([label, v]) => (
              <button key={label} type="button" onClick={() => setWorkerPct(String(v))} className="btn-secondary text-[11px] py-1 px-2">{label}</button>
            ))}
          </div>
        </div>
        <input type="range" min={0} max={100} step={1} value={wp} onChange={(e) => setWorkerPct(e.target.value)} className="w-full max-w-md accent-emerald-500" aria-label="Worker share" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {wp > 0 && (
          <RecipientPicker
            title="Workers"
            items={workerItems}
            selected={workers}
            onSelectedChange={setWorkers}
            mode={workerMode}
            onModeChange={setWorkerMode}
            pcts={workerPcts}
            onPctsChange={setWorkerPcts}
            quickSelects={[{ label: approvalRequired ? 'All approved' : 'All active', ids: eligibleIds }]}
            emptyText="No workers yet."
          />
        )}
        {wp < 100 && (
          <RecipientPicker
            title="Clients"
            items={clientItems}
            selected={clientSel}
            onSelectedChange={setClientSel}
            mode={clientMode}
            onModeChange={setClientMode}
            pcts={clientPcts}
            onPctsChange={setClientPcts}
            quickSelects={[{ label: 'All active clients', ids: activeClientIds }]}
            emptyText="No clients yet."
          />
        )}
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-theme-muted">Notes (optional)</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field w-full" />
      </label>

      {preview && <SharesTable shares={preview} currency={period.currency} />}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !total} onClick={() => void runPreview()} className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
          <Eye size={14} /> Preview split
        </button>
        <button type="submit" disabled={busy || !total || !title} className="btn-primary text-sm py-2 px-4">
          {busy ? 'Working…' : 'Save & apply to payslips'}
        </button>
      </div>
    </form>
  );
}

function SharesTable({ shares, currency }: { shares: Share[]; currency: string }) {
  const sum = shares.reduce((s, x) => s + Number(x.amount_base), 0);
  return (
    <div className="rounded-xl border border-white/10 overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {['Recipient', 'Type', 'Share of pool', `Amount (${currency})`, 'On payslip'].map((h, i) => (
              <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase text-theme-muted ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shares.map((s) => (
            <tr key={`${s.kind}-${s.recipient_id}`} className="border-b border-white/[0.04] last:border-0">
              <td className="px-3 py-1.5 text-theme-heading">{s.name}</td>
              <td className="px-3 py-1.5 text-theme-muted capitalize">{s.kind}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-theme-muted">{Number(s.pool_pct).toFixed(2)}%</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(s.amount_base)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-theme-muted">
                {s.amount_local != null ? `${money(s.amount_local)} ${s.local_currency}` : '—'}
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

// ── Existing entries ────────────────────────────────────────────────────────

function EntriesList({
  entries,
  editable,
  onDeleted,
  onError,
}: {
  entries: Entry[];
  editable: boolean;
  onDeleted: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async (entry: Entry) => {
    setBusy(true);
    try {
      await api.delete(`/cost-ledger/entries/${entry.id}`);
      onDeleted(`Removed “${entry.title}” and took its shares back off the payslips.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
      setConfirmId(null);
    }
  };

  return (
    <div className="glass-panel overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h2 className="text-sm font-bold text-theme-heading">Shared costs this month</h2>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-theme-muted text-sm">No shared costs entered for this month.</p>
      ) : (
        <ul>
          {entries.map((e) => {
            const workers = e.shares.filter((s) => s.kind === 'worker').length;
            const clients = e.shares.length - workers;
            const isOpen = open === e.id;
            return (
              <li key={e.id} className="border-b border-white/[0.04] last:border-0">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => setOpen(isOpen ? null : e.id)} className="text-theme-muted" aria-label="Show shares">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-theme-heading font-medium">{e.title}</div>
                    <div className="text-[11px] text-theme-muted">
                      {FIELD_LABELS[e.target_field]} · workers {Number(e.worker_pool_pct).toFixed(0)}% ({workers}, {e.worker_mode === 'equal' ? 'equal' : '% each'})
                      {' · '}clients {(100 - Number(e.worker_pool_pct)).toFixed(0)}% ({clients}, {e.client_mode === 'equal' ? 'equal' : '% each'})
                      {e.notes ? ` · ${e.notes}` : ''}
                    </div>
                  </div>
                  <div className="tabular-nums text-theme-heading font-semibold">{money(e.total_amount)} {e.currency}</div>
                  {editable && (
                    confirmId === e.id ? (
                      <span className="flex gap-1">
                        <button type="button" disabled={busy} onClick={() => void remove(e)} className="btn-secondary text-xs py-1.5 px-2 text-danger">Confirm remove</button>
                        <button type="button" onClick={() => setConfirmId(null)} className="btn-secondary text-xs py-1.5 px-2">Cancel</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmId(e.id)} className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1 text-danger">
                        <Trash2 size={12} /> Remove
                      </button>
                    )
                  )}
                </div>
                {isOpen && (
                  <div className="px-4 pb-4">
                    <SharesTable shares={e.shares} currency={e.currency} />
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
      onSaved(`Split ${money(total)} ${period.currency} across ${res.updated} client${res.updated === 1 ? '' : 's'}.`);
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
          <h2 className="text-sm font-bold text-theme-heading">Client earnings this month</h2>
          <p className="text-[11px] text-theme-muted">
            Usually one amount per client. Use “Split a total” when you only have the combined figure. These are the
            same amounts shown on each client&apos;s page in Clients.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/clients" className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5">
            <ExternalLink size={12} /> Clients page
          </Link>
          <Link
            href={`/admin/clients/ledger?period=${period.id}`}
            title="Hours, rate, expected vs received, client % and costs for every client"
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
            Total ({period.currency})
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
              <th className="text-right px-4 py-2 text-[10px] font-bold uppercase text-theme-muted">Earnings ({period.currency})</th>
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
