'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import ClientSplitModal from '@/components/payroll/ClientSplitModal';
import PeriodFilter from '@/components/platform/PeriodFilter';
import EditableCell from '@/components/payroll/EditableCell';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import type { ClientLedgerSheet, ClientMonth, Payee } from '@/lib/client-billing';
import { n } from '@/lib/client-ledger-edit';
import { pickCurrentPeriod } from '@/lib/periods';

interface Period { id: string; label: string; start_date: string; end_date: string; status: string; currency: string; is_current?: boolean }
interface Client { id: string; account_holder: string | null }

export default function ClientLedgerPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [sheet, setSheet] = useState<ClientLedgerSheet | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api.get<Period[]>('/payroll/periods'), api.get<Client[]>('/clients'), api.get<Payee[]>('/payees')])
      .then(([months, records, recipients]) => {
        setPeriods(months); setClients(records); setPayees(recipients);
        const wanted = new URLSearchParams(window.location.search).get('period');
        setPeriodId((months.find(p => p.id === wanted) ?? pickCurrentPeriod(months) ?? months[0])?.id ?? '');
        if (!months.length) setLoading(false);
      }).catch(e => { setError(e instanceof Error ? e.message : 'Could not load clients'); setLoading(false); });
  }, []);
  useEffect(() => {
    if (!periodId) return;
    let current = true;
    setLoading(true); setError(null);
    api.get<ClientLedgerSheet>(`/client-billing/periods/${periodId}`)
      .then(data => { if (current) setSheet(data); })
      .catch(e => { if (current) setError(e instanceof Error ? e.message : 'Could not load ledger'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [periodId]);
  const save = useCallback(async (id: string, fields: Record<string, unknown>) => {
    setSheet(await api.patch<ClientLedgerSheet>(`/client-billing/periods/${periodId}/clients/${id}`, fields));
  }, [periodId]);
  const recipientCount = Math.max(5, ...((sheet?.rows ?? []).map(r => Math.max(0, ...r.recipients.map(x => x.slot)))));
  const slots = Array.from({ length: recipientCount }, (_, i) => i);
  const cell = 'border border-brand-outline-variant px-1 py-0.5 h-6 whitespace-nowrap';
  const recipientInputs = (row: ClientMonth) =>
    slots.map(i => { const r = row.recipients.find(x => x.slot === i + 1); return { payee_id: r?.payee_id ?? null, name: r?.payee_id ? null : r?.name ?? null, pct: n(r?.pct), amount_override: r?.amount_override == null ? null : n(r.amount_override) }; });
  /** Put a recipient from the Recipients list in a slot; its % comes from its link to this client. */
  const pickRecipient = async (row: ClientMonth, index: number, payeeId: string) => {
    const recipients = recipientInputs(row);
    const payee = payees.find(p => p.id === payeeId);
    if (!payee) return;
    const linked = payee.links.find(l => l.client_id === row.client_id);
    const others = recipients.reduce((sum, r, j) => sum + (j === index ? 0 : r.pct), 0);
    const empty = !recipients[index].payee_id && !recipients[index].name;
    const pct = linked ? n(linked.pct) : empty ? Math.max(0, Math.round((100 - others) * 100) / 100) : recipients[index].pct;
    recipients[index] = { payee_id: payee.id, name: null, pct, amount_override: null };
    await save(row.client_id, { recipients });
  };
  const removeRecipient = async (row: ClientMonth, index: number) => {
    const recipients = recipientInputs(row);
    recipients[index] = { payee_id: null, name: null, pct: 0, amount_override: null };
    await save(row.client_id, { recipients });
  };
  const runSlot = (job: Promise<void>) => { setSlotError(null); job.catch(e => setSlotError(e instanceof Error ? e.message : 'Could not save the recipient.')); };
  const editPct = async (row: ClientMonth, index: number, value: string) => {
    const recipients = recipientInputs(row);
    const pct = Number(value || 0);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Enter a percentage between 0 and 100.');
    if (pct && !recipients[index].name && !recipients[index].payee_id) throw new Error('Pick the recipient first.');
    recipients[index].pct = pct;
    await save(row.client_id, { recipients });
  };
  return <div>
    <PageHeader title="Client Ledger" compact actions={<>
      <Link href="/admin/clients/ledger" className="btn-secondary text-xs py-2 px-3">Ledger</Link>
      <Link href="/admin/clients/ledger?split=1" className="btn-secondary text-xs py-2 px-3">Client splits</Link>
      <PeriodFilter periods={periods} value={periodId} onChange={setPeriodId} variant="inline" label="Working month" />
      <Link href="/admin/clients/recipients" className="btn-secondary text-xs py-2 px-3">Recipients</Link>
      <Link href="/admin/clients" className="btn-secondary text-xs py-2 px-3">Clients</Link>
    </>} />
    {error && <p role="alert" className="mb-3 text-danger text-sm">{error}</p>}
    {slotError && <p role="alert" className="mb-3 text-danger text-sm">{slotError}</p>}
    <p className="mb-2 text-[11px] text-theme-muted">Pick recipients from the <Link href="/admin/clients/recipients" className="underline">Recipients</Link> list; their % for the client fills in automatically and can still be changed for this month.</p>
    <div className="client-split-sheet overflow-auto max-h-[calc(100vh-14rem)] border border-brand-outline-variant" tabIndex={0} aria-label="Client split rules table">
      {loading ? <div className="flex justify-center py-16"><SpinningDots size="lg" /></div> :
      <table className="w-full min-w-[1640px] border-collapse text-[12px] leading-tight text-brand-on-surface bg-brand-surface-container" style={{ fontFamily: 'Arial, sans-serif' }}>
        <thead className="sticky top-0 z-10">
          <tr className="bg-brand-secondary-green text-white text-left">
            <th className={cell}>Client</th><th className={cell}>Controller / Holder</th>
            {slots.map(i => <Fragment key={i}><th className={cell}>Recipient {i + 1}</th><th className={cell}>% {i + 1}</th></Fragment>)}
            <th className={cell}>Total %</th><th className={cell}>Structure</th><th className={cell}>Notes</th>
            <th className={`${cell} sticky right-0 bg-brand-secondary-green`}><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody>{(sheet?.rows ?? []).map(row => {
          const locked = sheet?.status === 'paid' || row.locked;
          const holder = clients.find(c => c.id === row.client_id)?.account_holder ?? '';
          const total = row.recipients.reduce((sum, r) => sum + n(r.pct), 0);
          return <tr key={row.client_id} className="hover:bg-brand-surface-high">
            <td className={`${cell} min-w-[120px]`}>{row.client_name}</td>
            <td className={`${cell} min-w-[120px]`}><EditableCell label={`${row.client_name} controller / holder`} type="text" align="left" locked={locked} value={holder} display={holder || '\u00a0'} onSave={async value => {
              await api.patch(`/clients/${row.client_id}`, { account_holder: value || null });
              setClients(prev => prev.map(c => c.id === row.client_id ? { ...c, account_holder: value || null } : c));
            }} /></td>
            {slots.map(i => <Fragment key={i}>
              <td className={`${cell} min-w-[130px]`}>{(() => {
                const r = row.recipients.find(x => x.slot === i + 1);
                const filled = !!(r?.payee_id || r?.name);
                if (locked) return r?.name || '\u00a0';
                const taken = new Set(row.recipients.map(x => x.payee_id).filter(id => id && id !== r?.payee_id));
                return <div className="flex items-center gap-0.5">
                  <select value={r?.payee_id ?? ''} aria-label={`${row.client_name} recipient ${i + 1}`}
                    onChange={e => { if (e.target.value) runSlot(pickRecipient(row, i, e.target.value)); }}
                    className={`min-w-0 flex-1 bg-transparent text-[12px] outline-none cursor-pointer ${filled ? '' : 'text-emerald-accent'}`}>
                    {!filled && <option value="">+ Add</option>}
                    {filled && !r?.payee_id && <option value="">{r?.name} (not on Recipients)</option>}
                    {payees.filter(p => !taken.has(p.id) && (p.active || p.id === r?.payee_id)).map(p => {
                      const linked = p.links.find(l => l.client_id === row.client_id);
                      return <option key={p.id} value={p.id}>{p.name}{linked ? ` \u00b7 ${n(linked.pct)}%` : ''}</option>;
                    })}
                  </select>
                  {filled && <button type="button" onClick={() => runSlot(removeRecipient(row, i))} title="Remove recipient" aria-label={`Remove ${r?.name}`}
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-brand-on-surface-variant hover:text-danger"><X size={11} /></button>}
                </div>;
              })()}</td>
              <td className={`${cell} min-w-[66px] text-right tabular-nums`}><EditableCell label={`${row.client_name} percentage ${i + 1}`} locked={locked} value={String(n(row.recipients.find(r => r.slot === i + 1)?.pct))} display={`${n(row.recipients.find(r => r.slot === i + 1)?.pct).toFixed(1)}%`} onSave={v => editPct(row, i, v)} /></td>
            </Fragment>)}
            <td className={`${cell} text-right tabular-nums`} title={Math.abs(total - 100) > 0.11 ? 'Shares do not total 100%' : undefined}>{total.toFixed(1)}%</td>
            <td className={cell}>{row.recipients.filter(r => n(r.pct)).map(r => String(n(r.pct))).join(' / ')}</td>
            <td className={`${cell} min-w-[440px]`}><EditableCell type="text" align="left" inputWidth="w-96" label={`${row.client_name} notes`} locked={locked} value={row.notes ?? ''} display={row.notes || '\u00a0'} onSave={v => save(row.client_id, { notes: v || null })} /></td>
            <td className={`${cell} sticky right-0 bg-brand-surface-container text-center`}>
              <button type="button" onClick={() => setViewingId(row.client_id)} title="Details and recipients" aria-label={`${row.client_name} details`}
                className="inline-flex h-5 w-6 items-center justify-center rounded text-brand-on-surface hover:bg-brand-surface-high hover:text-emerald-accent">
                <Eye size={13} />
              </button>
            </td>
          </tr>;
        })}</tbody>
      </table>}
      {!loading && !sheet?.rows.length && <p className="p-6 text-sm text-theme-muted">No clients for this working month.</p>}
    </div>
    {(() => {
      const row = sheet?.rows.find(r => r.client_id === viewingId);
      if (!row || !sheet) return null;
      return <ClientSplitModal row={row} periodLabel={sheet.period_label} payees={payees}
        holder={clients.find(c => c.id === row.client_id)?.account_holder ?? ''}
        locked={sheet.status === 'paid' || row.locked}
        onSave={(fields) => save(row.client_id, fields)}
        onClose={() => setViewingId(null)} />;
    })()}
  </div>;
}
