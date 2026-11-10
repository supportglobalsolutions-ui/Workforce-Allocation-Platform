'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Landmark, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react';

import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import type { IncomeCategory, IncomeEntry, IncomeSheet } from '@/lib/client-billing';
import { currencyCodes, useCurrencies } from '@/lib/currencies';
import { formatMoney } from '@/lib/money';

interface Period {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
  is_current?: boolean;
}

interface ClientLite { id: string; name: string }

type Form = {
  category: IncomeCategory;
  amount: string;
  currency: string;
  fx_rate: string;
  description: string;
  client_id: string;
  received_on: string;
};

const n = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const money = (v: string | number) => n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const blankForm = (): Form => ({
  category: 'other', amount: '', currency: 'USD', fx_rate: '', description: '', client_id: '',
  received_on: new Date().toISOString().slice(0, 10),
});

const toForm = (e: IncomeEntry): Form => ({
  category: e.category,
  amount: String(n(e.amount)),
  currency: e.currency,
  fx_rate: e.currency === 'USD' ? '' : String(n(e.fx_rate)),
  description: e.description ?? '',
  client_id: e.client_id ?? '',
  received_on: e.received_on ?? '',
});

function EntryModal({ entry, categories, clients, onClose, onSubmit }: {
  entry: IncomeEntry | null;
  categories: Record<IncomeCategory, string>;
  clients: ClientLite[];
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const currencies = useCurrencies();
  const [form, setForm] = useState<Form>(entry ? toForm(entry) : blankForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Form) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: ev.target.value }));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (form.category === 'other' && !form.description.trim()) { setError('Describe what this income is.'); return; }
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      category: form.category,
      amount: n(form.amount),
      currency: form.currency,
      description: form.description.trim() || null,
      client_id: form.category === 'client_payout' && form.client_id ? form.client_id : null,
      received_on: form.received_on || null,
    };
    // A typed rate is sent only when changed; otherwise the server keeps or looks up the rate.
    if (form.currency !== 'USD' && form.fx_rate !== '' && (!entry || n(form.fx_rate) !== n(entry.fx_rate))) body.fx_rate = n(form.fx_rate);
    try {
      await onSubmit(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const label = 'text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block';
  const usd = form.currency === 'USD' ? n(form.amount) : form.fx_rate ? n(form.amount) / n(form.fx_rate) : null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xl p-4" role="dialog" aria-modal="true"
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <form onSubmit={save} className="glass-modal w-full max-w-lg rounded-2xl overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b border-white/[0.06]">
          <p className="text-base font-bold text-theme-heading">{entry ? 'Edit income' : 'Add income'}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <label className="block">
              <span className={label}>Amount received</span>
              <input required type="number" min={0} step="0.01" value={form.amount} onChange={set('amount')} className="input-field w-full tabular-nums" />
            </label>
            <label className="block">
              <span className={label}>Currency</span>
              <select value={form.currency} onChange={set('currency')} className="input-field w-full">
                {currencyCodes(currencies, form.currency).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className={label}>Description{form.category === 'other' ? '' : ' (optional)'}</span>
            <textarea rows={2} required={form.category === 'other'} value={form.description} onChange={set('description')} className="input-field w-full" />
          </label>
          <details className="text-sm text-theme-muted">
            <summary className="cursor-pointer">Optional details: category, client, date and exchange rate</summary>
            <div className="space-y-3 mt-3">
          <label className="block">
            <span className={label}>Category</span>
            <select value={form.category} onChange={set('category')} className="input-field w-full">
              {(Object.keys(categories) as IncomeCategory[]).map((c) => <option key={c} value={c}>{categories[c]}</option>)}
            </select>
          </label>
          {form.category === 'client_payout' && (
            <label className="block">
              <span className={label}>Client</span>
              <select value={form.client_id} onChange={set('client_id')} className="input-field w-full">
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className="mt-1 block text-[11px] text-theme-muted">Linked payouts are the client&apos;s revenue on the Client ledger.</span>
            </label>
          )}
          {form.currency !== 'USD' && (
            <label className="block">
              <span className={label}>{form.currency} per USD</span>
              <input type="number" min={0} step="any" value={form.fx_rate} onChange={set('fx_rate')}
                placeholder="Leave blank to use today’s rate" className="input-field w-full tabular-nums" />
              <span className="mt-1 block text-[11px] text-theme-muted">
                The rate is frozen on the entry. {usd != null ? `≈ USD ${money(usd)}` : ''}
              </span>
            </label>
          )}
          <label className="block">
            <span className={label}>Received on</span>
            <input type="date" value={form.received_on} onChange={set('received_on')} className="input-field w-full" />
          </label>
            </div>
          </details>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs"><AlertCircle size={14} /> {error}</div>
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

/** Money received in a working month, by category; the total is the month's income pool. */
export default function MonthIncome({ periodId, actionsTarget }: { periodId: string; actionsTarget?: HTMLElement | null }) {
  const [sheet, setSheet] = useState<IncomeSheet | null>(null);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<IncomeEntry | 'new' | null>(null);

  useEffect(() => {
    api.get<ClientLite[]>('/clients')
      .then((list) => setClients([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    if (!periodId) return;
    setLoading(true);
    setError(null);
    api.get<IncomeSheet>(`/income/periods/${periodId}`)
      .then(setSheet)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load income'))
      .finally(() => setLoading(false));
  }, [periodId]);
  useEffect(() => { load(); }, [load]);

  const entries = sheet?.entries ?? [];
  const locked = sheet?.locked ?? false;

  const submit = async (body: Record<string, unknown>) => {
    const data = editing && editing !== 'new'
      ? await api.patch<IncomeSheet>(`/income/entries/${editing.id}`, body)
      : await api.post<IncomeSheet>(`/income/periods/${periodId}`, body);
    setSheet(data);
    setEditing(null);
  };

  const remove = async (e: IncomeEntry) => {
    if (!window.confirm(`Delete this ${e.category_label.toLowerCase()} of ${money(e.amount)} ${e.currency}?`)) return;
    setError(null);
    try {
      setSheet(await api.delete<IncomeSheet>(`/income/entries/${e.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.');
    }
  };

  const by = sheet?.totals.by_category;
  const th = 'px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted whitespace-nowrap';
  const actions = (
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/clients/ledger${periodId ? `?period=${periodId}` : ''}`} className="btn-secondary text-sm py-2 px-4">Client ledger</Link>
        {!locked && sheet && <button type="button" onClick={() => setEditing('new')} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
          <Plus size={14} /> Add income
        </button>}
      </div>
  );
  return (
    <div>
      {actionsTarget ? createPortal(actions, actionsTarget) : <div className="mb-4">{actions}</div>}

      {locked && <p className="mb-4 text-xs text-amber-400">{sheet?.period_label} is paid, so its income is locked.</p>}
      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm"><AlertCircle size={14} /> {error}</div>
      )}

      {sheet && by && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KpiCard compact label="Income pool" value={formatMoney(n(sheet.totals.total_usd), 'USD')} icon={Wallet} accent="gold" highlight />
          <KpiCard compact label={sheet.categories.client_payout} value={formatMoney(n(by.client_payout), 'USD')} icon={Landmark} />
          <KpiCard compact label={sheet.categories.gs_account} value={formatMoney(n(by.gs_account), 'USD')} icon={Landmark} accent="emerald" />
          <KpiCard compact label={sheet.categories.other} value={formatMoney(n(by.other), 'USD')} icon={Landmark} accent="blue" />
        </div>
      )}

      <div className="glass-panel overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
        ) : entries.length === 0 ? (
          <p className="text-center text-theme-muted text-sm py-16">No income recorded for this month yet.</p>
        ) : (
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className={`${th} text-left`}>Received on</th>
                <th className={`${th} text-left`}>Category</th>
                <th className={`${th} text-left`}>Client / description</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={`${th} text-right`}>Rate</th>
                <th className={`${th} text-right`}>USD</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-3 py-2.5 text-theme-muted whitespace-nowrap">
                    {e.received_on ? new Date(`${e.received_on}T00:00:00`).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-theme-heading whitespace-nowrap">{e.category_label}</td>
                  <td className="px-3 py-2.5">
                    {e.client_name && <p className="text-theme-heading">{e.client_name}</p>}
                    {e.description && <p className="text-[11px] text-theme-muted">{e.description}</p>}
                    {!e.client_name && !e.description && <span className="text-theme-muted">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-theme-heading whitespace-nowrap">{money(e.amount)} {e.currency}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-theme-muted">
                    {e.currency === 'USD' ? '—' : n(e.fx_rate).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-theme-heading">{money(e.amount_usd)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {!locked && (
                      <>
                        <button type="button" onClick={() => setEditing(e)} aria-label="Edit income"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5"><Pencil size={14} /></button>
                        <button type="button" onClick={() => void remove(e)} aria-label="Delete income"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:text-danger hover:bg-danger/10"><Trash2 size={14} /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && sheet && (
        <EntryModal entry={editing === 'new' ? null : editing} categories={sheet.categories} clients={clients}
          onClose={() => setEditing(null)} onSubmit={submit} />
      )}
    </div>
  );
}
