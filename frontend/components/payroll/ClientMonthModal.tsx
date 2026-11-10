'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, X } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import type { ClientMonth } from '@/lib/client-billing';
import { changes, money, n, preview, toEdit, type LedgerEdit } from '@/lib/client-ledger-edit';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-theme-muted">{hint}</span>}
    </label>
  );
}

function Figure({ label, value, tone = 'text-theme-heading', hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5">{label}</p>
      <p className={`h-[38px] flex items-center px-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold tabular-nums ${tone}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-theme-muted">{hint}</p>}
    </div>
  );
}

/** Eye-click pop-up: everything on one client's ledger row, to view and edit together. */
export default function ClientMonthModal({
  row,
  periodLabel,
  locked,
  onClose,
  onSave,
}: {
  row: ClientMonth;
  periodLabel: string;
  locked: boolean;
  onClose: () => void;
  /** Persist the changed fields; throw to show an error. */
  onSave: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [e, setE] = useState<LedgerEdit>(() => toEdit(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = useMemo(() => preview(row, e), [row, e]);
  const diff = changes(row, e);
  const dirty = Object.keys(diff).length > 0;
  const manyEntries = row.income_entries > 1;

  const set = (key: keyof LedgerEdit) => (ev: React.ChangeEvent<HTMLInputElement>) =>
    setE((prev) => ({ ...prev, [key]: ev.target.value }));

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!dirty) { onClose(); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(diff);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const input = 'input-field !py-2 text-sm tabular-nums disabled:opacity-60 w-full';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xl p-4"
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <form onSubmit={save} className="glass-modal relative z-10 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden rounded-2xl">
        <div className="flex items-start justify-between p-5 border-b border-white/[0.06] shrink-0">
          <div>
            <p className="text-base font-bold text-theme-heading">{row.client_name}</p>
            <p className="text-xs text-theme-muted mt-0.5">
              {periodLabel} · {row.platform}
              {row.desktop_count ? ` · ${row.desktop_count} desktop${row.desktop_count === 1 ? '' : 's'}` : ''} · USD
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Billing */}
          <section className="rounded-xl border border-white/10 p-4 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Billing</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Hours from sessions" hint={`Linked sessions show ${n(row.desktop_hours).toFixed(2)} h`}>
                <button type="button" role="switch" aria-checked={e.hours_from_desktops} disabled={locked}
                  onClick={() => setE((prev) => ({ ...prev, hours_from_desktops: !prev.hours_from_desktops }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${e.hours_from_desktops ? 'bg-emerald-accent' : 'bg-white/15'}`}>
                  <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${e.hours_from_desktops ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </Field>
              <Field label="Billed hours">
                {e.hours_from_desktops ? (
                  <p className="h-[38px] flex items-center px-3 text-sm tabular-nums text-theme-heading">{n(row.desktop_hours).toFixed(2)}</p>
                ) : (
                  <input type="number" min={0} step="0.25" disabled={locked} value={e.billed_hours_manual}
                    onChange={set('billed_hours_manual')} placeholder="—" className={input} />
                )}
              </Field>
              <Field label="Rate USD / h" hint={row.rate_source === 'tier' ? `From tier ${row.tier_name}` : 'A client tier rate would win over this.'}>
                {row.rate_source === 'tier' ? (
                  <p className="h-[38px] flex items-center px-3 text-sm tabular-nums text-theme-heading">{money(n(row.rate))}</p>
                ) : (
                  <input type="number" min={0} step="0.01" disabled={locked} value={e.rate} onChange={set('rate')} className={input} />
                )}
              </Field>
              <Figure
                label="Expected (auto)"
                value={money(p.expected)}
                hint="Hours × account rate — updates as sessions and the Hours Log change."
              />
              <Field
                label="Received"
                hint={manyEntries
                  ? `${row.income_entries} Income tab entries; edit them there.`
                  : 'Optional. Edit if the actual payout differs from expected; saved on the Income tab.'}
              >
                <input type="number" min={0} step="0.01" disabled={locked || manyEntries} value={e.actual} onChange={set('actual')} placeholder="—" className={input} />
              </Field>
              <Field label="Received on">
                <input type="date" disabled={locked || manyEntries} value={e.received_on} onChange={set('received_on')} className={input} />
              </Field>
              <Figure label="Variance" value={p.variance == null ? '—' : `${p.variance > 0 ? '+' : ''}${money(p.variance)}`}
                tone={p.variance == null ? 'text-theme-muted' : p.variance < 0 ? 'text-danger' : 'text-emerald-accent'} />
            </div>
          </section>

          {/* Costs and split */}
          <section className="rounded-xl border border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Costs and split</p>
              <p className="text-sm font-semibold tabular-nums text-theme-heading">Revenue {money(p.billing)}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Figure label="Worker pay" value={money(n(row.worker_cost))} hint={`${n(row.session_hours).toFixed(2)} h by ${row.session_workers} worker${row.session_workers === 1 ? '' : 's'}`} />
              <Figure label="Transfer cost" value={money(n(row.transfer_cost))} hint="Workers' payslip transfer costs, by hours" />
              <Field label="Costs (one-off)" hint={n(row.shared_costs) ? `Plus ${money(n(row.shared_costs))} shared costs` : undefined}>
                <input type="number" min={0} step="0.01" disabled={locked} value={e.one_off} onChange={set('one_off')} className={input} />
              </Field>
              <Figure label="Total costs" value={money(p.totalCosts)} />
            </div>
            <Figure label="Net distributable" value={money(p.net)} tone={p.net < 0 ? 'text-danger' : 'text-emerald-accent'}
              hint="Revenue − worker pay − transfer cost − other costs; shared between the recipients below." />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5">Recipients</p>
              {row.recipients.filter((r) => r.name).length === 0 ? (
                <p className="text-xs text-theme-muted">No recipients yet. Turn on Client split on the ledger to add them.</p>
              ) : (
                <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/10">
                  {row.recipients.filter((r) => r.name).map((r) => (
                    <li key={r.slot} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="text-theme-heading">
                        {r.name}{r.is_gs && <span className="ml-1.5 text-[10px] font-bold text-emerald-accent">GS keeps</span>}
                      </span>
                      <span className="tabular-nums text-theme-muted">
                        {Number(r.pct)}% · <span className="text-theme-heading font-semibold">{money(n(r.amount))}</span>
                        {r.amount_override != null && <span className="ml-1 text-[10px] text-amber-400">typed</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[11px] text-theme-muted">Amounts update after saving. Edit recipients in the table with Client split on.</p>
            </div>
          </section>

          {row.warnings.length > 0 && (
            <ul className="space-y-1">
              {row.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2 text-[11px] text-amber-400"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}</li>
              ))}
            </ul>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 pt-4 border-t border-white/[0.06] shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">{locked ? 'Close' : 'Cancel'}</button>
          {!locked && (
            <button type="submit" disabled={saving || !dirty} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" /> : <CheckCircle size={14} />} Save
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
