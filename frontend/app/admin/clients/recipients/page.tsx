'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowLeft, Archive, Check, Pencil, Plus, Trash2, X } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import type { Payee, PayeeLink } from '@/lib/client-billing';
import { currencyCodes, useCurrencies } from '@/lib/currencies';

interface ClientOption { id: string; name: string }

type LinkRow = { client_id: string; pct: string };

type Form = {
  name: string;
  is_gs: boolean;
  payout_currency: string;
  payout_email: string;
  payout_method: string;
  payout_details: string;
  notes: string;
  active: boolean;
};

const blank: Form = {
  name: '', is_gs: false, payout_currency: 'USD', payout_email: '', payout_method: '', payout_details: '', notes: '', active: true,
};

const toForm = (p: Payee): Form => ({
  name: p.name,
  is_gs: p.is_gs,
  payout_currency: p.payout_currency ?? '',
  payout_email: p.payout_email ?? '',
  payout_method: p.payout_method ?? '',
  payout_details: p.payout_details ?? '',
  notes: p.notes ?? '',
  active: p.active,
});

function PayeeModal({ payee, clients, onClose, onSaved }: {
  payee: Payee | null; clients: ClientOption[]; onClose: () => void; onSaved: (skipped: string[]) => void;
}) {
  const currencies = useCurrencies();
  const [form, setForm] = useState<Form>(payee ? toForm(payee) : blank);
  const [links, setLinks] = useState<LinkRow[]>(
    (payee?.links ?? []).map((l) => ({ client_id: l.client_id, pct: String(Number(l.pct)) })),
  );
  const setLink = (i: number, patch: Partial<LinkRow>) => setLinks((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const takenClients = new Set(links.map((l) => l.client_id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Form) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: ev.target.value }));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const chosen = links.filter((l) => l.client_id);
    if (chosen.some((l) => { const pct = Number(l.pct || 0); return !Number.isFinite(pct) || pct < 0 || pct > 100; })) {
      setError('Each client % must be between 0 and 100.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = payee ? await api.patch<Payee>(`/payees/${payee.id}`, form) : await api.post<Payee>('/payees', form);
      const key = (rows: { client_id: string; pct: string }[]) => rows.map((l) => `${l.client_id}:${Number(l.pct || 0)}`).sort().join();
      let skipped: string[] = [];
      if (key(payee?.links ?? []) !== key(chosen)) {
        const res = await api.put<Payee & { skipped_clients: string[] }>(`/payees/${saved.id}/clients`, {
          links: chosen.map((l) => ({ client_id: l.client_id, pct: Number(l.pct || 0) })),
        });
        skipped = res.skipped_clients ?? [];
      }
      onSaved(skipped);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the recipient.');
    } finally {
      setSaving(false);
    }
  };

  const label = 'text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block';
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xl p-4" role="dialog" aria-modal="true"
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <form onSubmit={save} className="glass-modal w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden rounded-2xl">
        <div className="flex items-start justify-between p-5 border-b border-white/[0.06]">
          <p className="text-base font-bold text-theme-heading">{payee ? `Edit ${payee.name}` : 'Add recipient'}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          <label className="block">
            <span className={label}>Name</span>
            <input required maxLength={120} value={form.name} onChange={set('name')} className="input-field w-full" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className={label}>Payout currency</span>
              <select value={form.payout_currency} onChange={set('payout_currency')} className="input-field w-full">
                <option value="">—</option>
                {currencyCodes(currencies, form.payout_currency || 'USD').map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={label}>Payout method</span>
              <input maxLength={64} value={form.payout_method} onChange={set('payout_method')} placeholder="Bank, mobile money…" className="input-field w-full" />
            </label>
          </div>
          <label className="block">
            <span className={label}>Statement email</span>
            <input type="email" maxLength={255} value={form.payout_email} onChange={set('payout_email')} className="input-field w-full" />
          </label>
          <label className="block">
            <span className={label}>Payout details</span>
            <textarea rows={3} value={form.payout_details} onChange={set('payout_details')} placeholder="Account name and number, phone…" className="input-field w-full" />
          </label>
          <div>
            <span className={label}>Clients and %</span>
            <p className="text-[11px] text-theme-muted mb-2">
              This recipient&apos;s share of each client&apos;s net. Changes also update the current working month&apos;s client split.
            </p>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={l.client_id} onChange={(e) => setLink(i, { client_id: e.target.value })} aria-label="Client" className="input-field flex-1 min-w-0">
                    <option value="">Pick a client…</option>
                    {clients.filter((c) => c.id === l.client_id || !takenClients.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} max={100} step="0.01" value={l.pct} onChange={(e) => setLink(i, { pct: e.target.value })}
                      aria-label="Percentage" className="input-field w-20 text-right" />
                    <span className="text-xs text-theme-muted">%</span>
                  </div>
                  <button type="button" onClick={() => setLinks((rows) => rows.filter((_, j) => j !== i))} aria-label="Remove client"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:text-danger hover:bg-danger/10"><X size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setLinks((rows) => [...rows, { client_id: '', pct: '' }])}
                disabled={links.length >= clients.length}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-accent hover:underline disabled:opacity-50">
                <Plus size={12} /> Link a client
              </button>
            </div>
          </div>
          <label className="block">
            <span className={label}>Notes</span>
            <textarea rows={2} value={form.notes} onChange={set('notes')} className="input-field w-full" />
          </label>
          <label className="flex items-start gap-2 text-sm text-theme-heading cursor-pointer">
            <input type="checkbox" checked={form.is_gs} onChange={(e) => setForm((f) => ({ ...f, is_gs: e.target.checked }))} className="mt-1" />
            <span>
              This is Global Solutions
              <span className="block text-[11px] text-theme-muted">Its share is kept, not paid out. Only one recipient can have this.</span>
            </span>
          </label>
          {payee && (
            <label className="flex items-center gap-2 text-sm text-theme-heading cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> Active
            </label>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5 pt-4 border-t border-white/[0.06]">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
            {saving ? <SpinningDots size="sm" /> : <Check size={14} />} Save
          </button>
        </div>
      </form>
    </div>
  );
}

/** Who client money is paid to; recipients on the client split pick from this list. */
export default function RecipientsPage() {
  const [payees, setPayees] = useState<Payee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Payee | 'new' | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<Payee[]>('/payees')
      .then(setPayees)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load recipients'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<ClientOption[]>('/clients')
      .then((rows) => setClients([...rows].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => undefined);
  }, []);

  const visible = payees.filter((p) => p.active);

  const archive = async (p: Payee) => {
    if (!window.confirm(`Remove ${p.name}? A recipient already used on a split or payout is archived instead.`)) return;
    setError(null);
    try {
      await api.delete(`/payees/${p.id}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the recipient.');
    }
  };

  const removeClientLink = async (payee: Payee, clientId: string, clientName: string) => {
    if (!window.confirm(`Remove ${payee.name} from ${clientName}?`)) return;
    setError(null);
    try {
      const result = await api.put<Payee & { skipped_clients: string[] }>(`/payees/${payee.id}/clients`, {
        links: payee.links.filter((link) => link.client_id !== clientId)
          .map((link) => ({ client_id: link.client_id, pct: Number(link.pct) })),
      });
      setPayees((current) => current.map((item) => item.id === payee.id ? result : item));
      setNotice(result.skipped_clients.length
        ? `Removed the recipient link. The current month was already paid for ${result.skipped_clients.join(', ')}, so those splits were left unchanged.`
        : `${payee.name} was removed from ${clientName}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the client link.');
    }
  };

  const th = 'px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-theme-muted';
  const recipientRows: { payee: Payee; link: PayeeLink | null }[] = [];
  for (const payee of visible) {
    if (payee.links.length) {
      for (const link of payee.links) recipientRows.push({ payee, link });
    } else {
      recipientRows.push({ payee, link: null });
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        compact
        title="Recipients"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href="/admin/clients/ledger?split=1" className="btn-secondary text-xs py-2 px-3">Client split</Link>
            <Link href="/admin/clients" className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"><ArrowLeft size={14} /> Clients</Link>
            <button type="button" onClick={() => setEditing('new')} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2"><Plus size={14} /> Add recipient</button>
          </div>
        }
      />
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs"><AlertCircle size={14} /> {error}</div>
      )}
      {notice && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs">
          <AlertTriangle size={14} /> {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="ml-auto"><X size={12} /></button>
        </div>
      )}
      <div className="glass-panel overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
        ) : recipientRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-theme-muted">No recipients yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-white/[0.03]">
                <tr>
                  <th className={th}>Recipient</th>
                  <th className={th}>Connected client</th>
                  <th className={`${th} text-right`}>Share</th>
                  <th className={th}>Payout details</th>
                  <th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recipientRows.map(({ payee: p, link }) => (
                  <tr key={`${p.id}:${link?.client_id ?? 'unlinked'}`} className={`border-t border-white/[0.06] ${p.active ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-theme-heading flex items-center gap-2">
                        {p.name}
                        {p.is_gs && <span className="rounded-md bg-emerald-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-accent">Keeps share</span>}
                        {!p.active && <span className="text-[10px] text-theme-muted">archived</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-theme-heading">{link?.client_name ?? <span className="text-theme-muted">No client connected</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-theme-heading">{link ? `${Number(link.pct)}%` : '—'}</td>
                    <td className="px-4 py-3">
                      {p.payout_ready ? (
                        <p className="text-xs text-theme-heading whitespace-pre-line line-clamp-2">
                          {p.is_gs ? 'Kept by Global Solutions' : [p.payout_currency, p.payout_method, p.payout_details].filter(Boolean).join(' · ')}
                        </p>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-400"><AlertTriangle size={12} /> Missing payout details</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5"><Pencil size={14} /></button>
                      {link ? (
                        <button type="button" onClick={() => void removeClientLink(p, link.client_id, link.client_name)}
                          aria-label={`Remove ${p.name} from ${link.client_name}`} title="Remove client link"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:text-danger hover:bg-danger/10"><Trash2 size={14} /></button>
                      ) : !p.is_gs && p.active && (
                        <button type="button" onClick={() => void archive(p)} aria-label={`Remove ${p.name}`} title="Remove or archive"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:text-danger hover:bg-danger/10"><Archive size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <PayeeModal payee={editing === 'new' ? null : editing} clients={clients} onClose={() => setEditing(null)}
          onSaved={(skipped) => {
            setEditing(null); load();
            setNotice(skipped.length ? `Saved. The current month is already paid for ${skipped.join(', ')}, so its split was not changed.` : null);
          }} />
      )}
    </div>
  );
}
