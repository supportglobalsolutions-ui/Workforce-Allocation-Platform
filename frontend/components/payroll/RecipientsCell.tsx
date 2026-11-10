'use client';

import { useState } from 'react';
import { AlertTriangle, Plus, RotateCcw, X } from 'lucide-react';

import EditableCell from '@/components/payroll/EditableCell';
import type { ClientMonth, Payee, SplitRecipient } from '@/lib/client-billing';
import { money, n } from '@/lib/client-ledger-edit';

/** What the API takes for one recipient. */
export interface RecipientInput {
  payee_id: string | null;
  name: string | null;
  pct: number;
  amount_override: number | null;
}

const NEW = '__new__';

const toInput = (r: SplitRecipient): RecipientInput => ({
  payee_id: r.payee_id,
  name: r.payee_id ? null : r.name,
  pct: n(r.pct),
  amount_override: r.amount_override == null ? null : n(r.amount_override),
});

/**
 * The recipients of one client's net distributable: a payee, its %, and the
 * amount (net × %, or a typed amount with a reset). Every change saves the
 * client's whole recipient list straight away.
 */
export default function RecipientsCell({
  row,
  payees,
  locked,
  onSave,
  onCreatePayee,
}: {
  row: ClientMonth;
  payees: Payee[];
  locked: boolean;
  onSave: (recipients: RecipientInput[]) => Promise<void>;
  onCreatePayee: (name: string) => Promise<Payee>;
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = row.recipients.filter((r) => r.name);
  const current = lines.map(toInput);
  const pctTotal = lines.reduce((s, r) => s + n(r.pct), 0);

  const run = async (next: RecipientInput[]) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const quiet = (next: RecipientInput[]) => run(next).catch(() => undefined);

  const update = (i: number, patch: Partial<RecipientInput>) =>
    run(current.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /** The payee id picked in a select, creating a new payee when asked. */
  const pickPayee = async (value: string): Promise<string | null> => {
    if (value !== NEW) return value || null;
    const name = window.prompt('Name of the new recipient')?.trim();
    if (!name) return null;
    try {
      return (await onCreatePayee(name)).id;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the recipient.');
      return null;
    }
  };

  const options = (selected: string | null) => {
    const taken = new Set(current.map((r) => r.payee_id).filter((id) => id && id !== selected));
    return payees.filter((p) => !taken.has(p.id) && (p.active || p.id === selected));
  };

  const select = 'input-field !py-1 !px-1.5 text-xs w-[9.5rem] min-w-0';

  return (
    <div className="space-y-1 min-w-[22rem]">
      {lines.map((r, i) => (
        <div key={`${r.slot}-${r.payee_id ?? r.name}`} className="grid grid-cols-[9.5rem_4.5rem_7rem_1.25rem] items-center gap-1.5">
          <div className="flex items-center gap-1 min-w-0">
            {locked ? (
              <span className="truncate text-theme-heading" title={r.name ?? ''}>{r.name}</span>
            ) : (
              <select value={r.payee_id ?? ''} disabled={busy} aria-label="Recipient"
                onChange={async (ev) => {
                  const id = await pickPayee(ev.target.value);
                  if (id) void quiet(current.map((x, j) => (j === i ? { ...x, payee_id: id, name: null } : x)));
                }}
                className={select}>
                {!r.payee_id && <option value="">{r.name} (not on the Recipients list)</option>}
                {options(r.payee_id).map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_gs ? ' (GS)' : ''}</option>)}
                <option value={NEW}>+ New recipient…</option>
              </select>
            )}
            {!r.is_gs && (!r.payee_id || !r.payout_ready) && (
              <span title={!r.payee_id ? 'Not on the Recipients list yet' : 'No payout details on the recipient'} className="shrink-0 inline-flex">
                <AlertTriangle size={11} className="text-amber-400" />
              </span>
            )}
          </div>
          <EditableCell label={`${r.name} %`} locked={locked} inputWidth="w-14" value={String(n(r.pct))}
            onSave={(v) => update(i, { pct: Number(v || 0) })}
            display={<span className="tabular-nums text-theme-muted">{n(r.pct)}%</span>} />
          <div className="text-right">
            <EditableCell label={`${r.name} amount`} locked={locked} inputWidth="w-20" value={String(n(r.amount))}
              hint={`Type the amount (worked out: ${money(n(r.amount_calc))})`}
              onSave={(v) => update(i, { amount_override: v === '' ? null : Number(v) })}
              display={
                <span className={`tabular-nums font-semibold ${r.amount_override != null ? 'text-amber-400' : r.is_gs ? 'text-emerald-accent' : 'text-theme-heading'}`}>
                  {money(n(r.amount))}
                </span>
              } />
            {r.amount_override != null && !locked && (
              <button type="button" disabled={busy} onClick={() => void quiet(current.map((x, j) => (j === i ? { ...x, amount_override: null } : x)))}
                title={`Go back to the worked-out ${money(n(r.amount_calc))}`}
                className="ml-auto flex items-center gap-1 text-[9px] text-theme-muted hover:text-amber-400 tabular-nums">
                <RotateCcw size={9} /> auto {money(n(r.amount_calc))}
              </button>
            )}
          </div>
          {!locked ? (
            <button type="button" disabled={busy} onClick={() => void quiet(current.filter((_, j) => j !== i))}
              aria-label={`Remove ${r.name}`} title="Remove recipient"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-theme-muted hover:text-danger hover:bg-danger/10">
              <X size={12} />
            </button>
          ) : <span />}
        </div>
      ))}

      {adding && !locked && (
        <div className="flex items-center gap-1.5">
          <select autoFocus defaultValue="" disabled={busy} aria-label="New recipient"
            onChange={async (ev) => {
              const id = await pickPayee(ev.target.value);
              if (!id) return;
              const pct = Math.max(0, Math.round((100 - pctTotal) * 100) / 100);
              await quiet([...current, { payee_id: id, name: null, pct, amount_override: null }]);
              setAdding(false);
            }}
            className={select}>
            <option value="" disabled>Pick a recipient…</option>
            {options(null).map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_gs ? ' (GS)' : ''}</option>)}
            <option value={NEW}>+ New recipient…</option>
          </select>
          <button type="button" onClick={() => setAdding(false)} aria-label="Cancel"
            className="rounded p-1 text-theme-muted hover:text-theme-heading"><X size={12} /></button>
        </div>
      )}

      <div className="flex items-center gap-3 text-[10px]">
        {!locked && !adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 font-semibold text-emerald-accent hover:underline">
            <Plus size={10} /> Add recipient
          </button>
        )}
        {lines.length > 0 && Math.abs(pctTotal - 100) >= 0.005 && (
          <span className="text-amber-400 tabular-nums">{pctTotal.toFixed(2)}% of 100%</span>
        )}
        {row.recipients_from && lines.length > 0 && (
          <span className="text-theme-muted" title="Saving a change keeps these recipients for this month">
            {row.recipients_from === 'agreement' ? 'from the agreement' : row.recipients_from === 'default' ? 'default' : `from ${row.recipients_from}`}
          </span>
        )}
        {busy && <span className="text-theme-muted">Saving…</span>}
      </div>
      {error && <p className="text-[10px] text-danger">{error}</p>}
    </div>
  );
}
