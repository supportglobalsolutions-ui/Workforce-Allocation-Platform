'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, Lock, Plus, Trash2, X } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import type { ClientMonth, Payee } from '@/lib/client-billing';
import { n } from '@/lib/client-ledger-edit';

export interface RecipientInput {
  payee_id: string | null;
  name: string | null;
  pct: number;
  amount_override: number | null;
}

interface Draft {
  key: string;
  name: string;
  pct: string;
  amount_override: number | null;
}

const money = (v: string | number | null | undefined) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let nextKey = 0;
const key = () => `r${nextKey++}`;

/**
 * One client's month on the Client splits sheet: where the money comes from,
 * what it costs, and who shares the rest. Recipients can be added, removed
 * and re-weighted here and saved in one go.
 */
export default function ClientSplitModal({
  row, periodLabel, holder, payees, locked, onSave, onClose,
}: {
  row: ClientMonth;
  periodLabel: string;
  holder: string;
  payees: Payee[];
  locked: boolean;
  onSave: (fields: { recipients: RecipientInput[]; notes: string | null; actual?: number | null }) => Promise<void>;
  onClose: () => void;
}) {
  const initial = useMemo<Draft[]>(
    () => [...row.recipients].sort((a, b) => a.slot - b.slot).map((r) => ({
      key: key(),
      name: r.name ?? '',
      pct: String(n(r.pct)),
      amount_override: r.amount_override == null ? null : n(r.amount_override),
    })),
    [row.recipients],
  );
  const [drafts, setDrafts] = useState<Draft[]>(initial);
  const [notes, setNotes] = useState(row.notes ?? '');
  const [received, setReceived] = useState(row.actual != null ? String(n(row.actual)) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manyEntries = row.income_entries > 1;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const net = n(row.net_distributable);
  const byName = (name: string) => payees.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
  const total = drafts.reduce((s, d) => s + (Number(d.pct) || 0), 0);
  const off = drafts.length > 0 && Math.abs(total - 100) > 0.1;
  const initialReceived = row.actual != null ? String(n(row.actual)) : '';
  const dirty = notes !== (row.notes ?? '')
    || received !== initialReceived
    || JSON.stringify(drafts.map(({ name, pct, amount_override }) => [name.trim(), Number(pct) || 0, amount_override]))
      !== JSON.stringify(initial.map(({ name, pct, amount_override }) => [name.trim(), Number(pct) || 0, amount_override]));

  const update = (k: string, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === k ? { ...d, ...patch } : d)));
  const remove = (k: string) => setDrafts((prev) => prev.filter((d) => d.key !== k));
  const add = () => setDrafts((prev) => [...prev, { key: key(), name: '', pct: '0', amount_override: null }]);
  const splitEqually = () => setDrafts((prev) => {
    if (!prev.length) return prev;
    const each = Math.floor((100 / prev.length) * 100) / 100;
    return prev.map((d, i) => ({
      ...d,
      pct: String(i === prev.length - 1 ? Math.round((100 - each * (prev.length - 1)) * 100) / 100 : each),
    }));
  });

  const save = async () => {
    setError(null);
    const named = drafts.filter((d) => d.name.trim());
    if (drafts.some((d) => !d.name.trim() && Number(d.pct) > 0)) { setError('Every recipient with a share needs a name.'); return; }
    const names = named.map((d) => d.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) { setError('A recipient is listed twice.'); return; }
    if (named.some((d) => { const p = Number(d.pct); return !Number.isFinite(p) || p < 0 || p > 100; })) {
      setError('Each share must be between 0% and 100%.'); return;
    }
    let actual: number | null | undefined;
    if (!manyEntries && received !== initialReceived) {
      if (received.trim() === '') actual = null;
      else {
        const value = Number(received);
        if (!Number.isFinite(value) || value < 0) { setError('Received must be a number that is 0 or more.'); return; }
        actual = value;
      }
    }
    setSaving(true);
    try {
      await onSave({
        recipients: named.map((d) => {
          const payee = byName(d.name);
          return { payee_id: payee?.id ?? null, name: payee ? null : d.name.trim(), pct: Number(d.pct) || 0, amount_override: d.amount_override };
        }),
        notes: notes.trim() || null,
        ...(actual !== undefined ? { actual } : {}),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the split.');
    } finally {
      setSaving(false);
    }
  };

  const label = 'text-[10px] font-bold uppercase tracking-wider text-theme-muted';
  const stat = (title: string, value: string, sub?: string, tone = 'text-theme-heading') => (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <p className={label}>{title}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-theme-muted mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true"
      aria-label={`${row.client_name} split`} onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="glass-modal w-full max-w-3xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-white/[0.06]">
          <div>
            <p className="text-base font-bold text-theme-heading">{row.client_name}</p>
            <p className="text-xs text-theme-muted mt-0.5">
              {[row.platform, periodLabel, row.contract_status !== 'active' ? row.contract_status : null, holder ? `Holder: ${holder}` : null]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {locked && (
            <p className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-400">
              <Lock size={13} /> This month is paid for this client, so the split is read-only.
            </p>
          )}

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {stat(
              'Expected (auto)',
              row.expected != null ? `USD ${money(row.expected)}` : '—',
              'Hours × account rate — updates as sessions change',
            )}
            {stat(
              'Revenue',
              `USD ${money(row.billing)}`,
              row.billing_source === 'actual'
                ? 'Using received'
                : row.billing_source === 'expected'
                  ? 'Using expected (not received yet)'
                  : undefined,
            )}
            {stat('Total costs', `USD ${money(row.split_total_costs)}`, `Workers ${money(row.worker_cost)} · transfer ${money(row.transfer_cost)} · other ${money(row.client_costs)}`)}
            {stat('Net to share', `USD ${money(row.net_distributable)}`, 'Revenue − total costs', 'text-emerald-accent')}
          </div>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            <label className="block rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <span className={label}>Received (pencil)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={locked || manyEntries}
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder={row.expected != null ? money(row.expected) : '—'}
                aria-label="Received amount USD"
                className="input-field w-full mt-1.5 !py-2 text-sm tabular-nums disabled:opacity-60"
              />
              <p className="text-[11px] text-theme-muted mt-1.5">
                {manyEntries
                  ? `${row.income_entries} Income tab entries — edit them on Payroll → Income.`
                  : 'Auto income is expected from hours × rate. Edit only if the actual payout differs.'}
              </p>
            </label>
            {stat('GS keeps', `USD ${money(row.gs_amount)}`, `To recipients: ${money(row.payout_amount)}`)}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-theme-muted">
            <span>Hours: {row.billed_hours != null ? money(row.billed_hours) : '—'}{row.hours_source ? ` (${row.hours_source === 'desktops' ? 'from linked sessions' : 'typed'})` : ''}</span>
            <span>Rate: {row.rate != null ? `USD ${money(row.rate)}/h` : '—'}{row.tier_name ? ` · ${row.tier_name}` : ''}</span>
            <span>Sessions: {money(row.session_hours)} h by {row.session_workers} worker{row.session_workers === 1 ? '' : 's'}</span>
            <span>Payout: {row.payout_status ?? 'not prepared'}</span>
            {row.recipients_from && <span>Recipients carried from {row.recipients_from === 'agreement' ? 'the agreement' : row.recipients_from === 'default' ? 'the default' : row.recipients_from}</span>}
          </div>

          {row.warnings.length > 0 && (
            <ul className="space-y-1">
              {row.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2 text-xs text-amber-400"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}</li>
              ))}
            </ul>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-bold text-theme-heading">Recipients</p>
              {!locked && (
                <div className="flex gap-2">
                  <button type="button" onClick={splitEqually} disabled={!drafts.length} className="btn-secondary text-[11px] py-1.5 px-2.5">Split equally</button>
                  <button type="button" onClick={add} className="btn-secondary text-[11px] py-1.5 px-2.5 inline-flex items-center gap-1"><Plus size={11} /> Add recipient</button>
                </div>
              )}
            </div>
            <datalist id={`recipients-${row.client_id}`}>
              {payees.filter((p) => p.active).map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
            <div className="rounded-xl border border-white/10 overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Recipient', 'Share %', 'Amount (USD)', ''].map((h, i) => (
                      <th key={i} className={`px-3 py-2 text-[10px] font-bold uppercase text-theme-muted ${i === 1 || i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drafts.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-theme-muted">No recipients. Add one to share this client&apos;s net.</td></tr>
                  ) : drafts.map((d) => {
                    const payee = d.name.trim() ? byName(d.name) : undefined;
                    const amount = d.amount_override ?? (net * (Number(d.pct) || 0)) / 100;
                    const hint = !d.name.trim() ? null
                      : !payee ? 'New — added to the Recipients list when you save'
                        : !payee.is_gs && !payee.payout_ready ? 'No payout details on this recipient' : null;
                    return (
                      <tr key={d.key} className="border-b border-white/[0.04] last:border-0 align-top">
                        <td className="px-3 py-1.5">
                          <input value={d.name} disabled={locked} list={`recipients-${row.client_id}`} onChange={(e) => {
                              const linked = byName(e.target.value)?.links.find((l) => l.client_id === row.client_id);
                              update(d.key, { name: e.target.value, ...(linked ? { pct: String(n(linked.pct)) } : {}) });
                            }}
                            placeholder="Pick or type a name" aria-label="Recipient name" className="input-field w-full !py-1.5" />
                          <div className="mt-0.5 flex flex-wrap gap-2 text-[10px]">
                            {payee?.is_gs && <span className="text-emerald-accent">Global Solutions — keeps its share</span>}
                            {payee?.payout_currency && !payee.is_gs && <span className="text-theme-muted">Paid in {payee.payout_currency}</span>}
                            {hint && <span className="text-amber-400">{hint}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input type="number" min={0} max={100} step="0.1" value={d.pct} disabled={locked}
                            onChange={(e) => update(d.key, { pct: e.target.value })} aria-label="Share percent"
                            className="input-field w-24 !py-1.5 text-right tabular-nums" />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {money(amount)}
                          {d.amount_override != null && (
                            <div className="text-[10px] text-theme-muted">
                              typed amount{!locked && <> · <button type="button" className="underline hover:text-theme-heading" onClick={() => update(d.key, { amount_override: null })}>use %</button></>}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {!locked && (
                            <button type="button" onClick={() => remove(d.key)} aria-label={`Remove ${d.name || 'recipient'}`}
                              className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-danger hover:bg-danger/10"><Trash2 size={14} /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {drafts.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-white/10">
                      <td className="px-3 py-2 text-xs text-theme-muted">Total</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${off ? 'text-danger' : 'text-emerald-accent'}`}>{Number(total.toFixed(2))}%</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(drafts.reduce((s, d) => s + (d.amount_override ?? (net * (Number(d.pct) || 0)) / 100), 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {off && <p className="mt-1.5 text-[11px] text-danger">Shares add up to {Number(total.toFixed(2))}%, not 100%.</p>}
            <p className="mt-1.5 text-[11px] text-theme-muted">
              Names from the <Link href="/admin/clients/recipients" className="underline hover:text-theme-heading">Recipients list</Link> get
              one combined statement a month. A new name is added to that list when you save; add their payout details there.
            </p>
          </div>

          <label className="block">
            <span className={label}>Notes</span>
            <textarea rows={2} value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} className="input-field w-full mt-1.5" />
          </label>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs"><AlertCircle size={14} /> {error}</div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 pt-4 border-t border-white/[0.06]">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">{locked ? 'Close' : 'Cancel'}</button>
          {!locked && (
            <button type="button" onClick={() => void save()} disabled={saving || !dirty} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" /> : <Check size={14} />} Save split
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
