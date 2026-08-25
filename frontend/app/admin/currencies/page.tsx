'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Coins, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import ConfirmModal from '@/components/platform/ConfirmModal';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  usd_rate: number | null;
  usd_rate_source: 'manual' | 'api' | 'identity' | 'derived' | null;
  gbp_rate: number | null;
  created_at: string;
}

interface AvailableCurrency {
  code: string;
  name: string;
  usd_rate: number;
}

/** Small currencies like GBP sit below 1, so keep enough precision to be readable. */
const fmtExchange = (x: number | null) => {
  if (x === null || x === undefined) return '—';
  const n = Number(x);
  const digits = n !== 0 && Math.abs(n) < 10 ? 4 : 2;
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

function RateSourceChip({ source }: { source: Currency['usd_rate_source'] }) {
  if (!source || source === 'identity') return null;
  const styles: Record<string, string> = {
    manual:  'bg-gold-accent/20 text-gold-accent border-gold-accent/30',
    api:     'bg-white/10 text-theme-muted border-white/10',
    derived: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${styles[source]}`}>
      {source}
    </span>
  );
}

const PROTECTED = new Set(['USD', 'GBP']);

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<Currency[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [available, setAvailable] = useState<AvailableCurrency[] | null>(null);
  const [availableError, setAvailableError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState('');
  const [addRate, setAddRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState('');
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Currency | null>(null);
  const [removing, setRemoving] = useState(false);

  const selected = available?.find((c) => c.code === selectedCode) ?? null;

  const load = useCallback(() => {
    api.get<Currency[]>('/currencies/list')
      .then(setCurrencies)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load currencies'));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!showAdd) return;
    setAvailable(null);
    setAvailableError(null);
    setSelectedCode('');
    setAddRate('');
    setFormError(null);
    api.get<AvailableCurrency[]>('/currencies/available')
      .then(setAvailable)
      .catch((e) => setAvailableError(e instanceof Error ? e.message : 'Failed to load FX API currencies.'));
  }, [showAdd]);

  useEffect(() => {
    if (!selected) {
      setAddRate('');
      return;
    }
    setAddRate(String(selected.usd_rate));
  }, [selected]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setFormError(null);
    try {
      const rateNum = Number(addRate);
      const payload: { code: string; name: string; usd_rate?: number } = {
        code: selected.code,
        name: selected.name,
      };
      // Send a manual override only when the admin changed the live API value.
      if (Number.isFinite(rateNum) && rateNum > 0 && Math.abs(rateNum - selected.usd_rate) > 1e-9) {
        payload.usd_rate = rateNum;
      }
      await api.post<Currency>('/currencies/list', payload);
      setSelectedCode('');
      setShowAdd(false);
      setNote(`Added ${selected.code}.`);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add currency.');
    } finally {
      setSaving(false);
    }
  }

  async function saveRate(c: Currency) {
    setRowBusy(c.id);
    setError(null);
    try {
      await api.patch<Currency>(`/currencies/list/${c.id}`, { usd_rate: Number(editRate) });
      setEditingId(null);
      setNote(`Updated ${c.code} rate.`);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save rate.');
    } finally {
      setRowBusy(null);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setNote(null);
    setError(null);
    try {
      const res = await api.post<{ stored: { USD: number; GBP: number } }>('/currencies/rates/refresh', {});
      setNote(`Refreshed from API — ${res.stored.USD} USD and ${res.stored.GBP} GBP rates stored.`);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to refresh rates.');
    } finally {
      setRefreshing(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    setError(null);
    try {
      await api.delete(`/currencies/list/${removeTarget.id}`);
      setNote(`Removed ${removeTarget.code}.`);
      setRemoveTarget(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove currency.');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Currencies" />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-theme-heading flex items-center gap-2">
              <Coins size={13} className="text-gold-accent" /> Currencies
            </h2>
            <p className="text-[11px] text-theme-muted mt-0.5">
              One catalog — refresh rates from the API, add currencies, edit rates, or remove.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowAdd((v) => !v)}
              className={`${showAdd ? 'btn-primary' : 'btn-secondary'} text-xs py-1.5 px-3 flex items-center gap-1.5`}>
              <Plus size={12} /> Add Currency
            </button>
            <button type="button" disabled={refreshing} onClick={() => void handleRefresh()}
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-60">
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh from API
            </button>
          </div>
        </div>

        {showAdd && (
          <form onSubmit={handleAdd} className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap items-end gap-3 bg-white/[0.02]">
            <div className="flex-1 min-w-[16rem]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Currency from FX API</label>
              {available === null && !availableError ? (
                <div className="input-field flex items-center gap-2 text-theme-muted">
                  <SpinningDots size="sm" /> Loading currencies…
                </div>
              ) : (
                <select required value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)} className="input-field">
                  <option value="">Select a currency…</option>
                  {(available ?? []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {selected && (
              <div className="w-44">
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">
                  1 USD = (editable)
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  required
                  value={addRate}
                  onChange={(e) => setAddRate(e.target.value)}
                  className="input-field tabular-nums"
                />
              </div>
            )}
            <button type="submit" disabled={saving || !selected} className="btn-primary text-sm py-2 px-4 disabled:opacity-60">
              {saving ? 'Adding…' : 'Add'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary text-sm py-2 px-4">
              Cancel
            </button>
            {availableError && <p className="w-full text-xs text-danger">{availableError}</p>}
            {formError && <p className="w-full text-xs text-danger">{formError}</p>}
          </form>
        )}

        {note && (
          <p className="px-4 py-2 text-xs text-emerald-accent bg-emerald-accent/5 border-b border-white/[0.06] flex items-center justify-between gap-2">
            <span>{note}</span>
            <button type="button" onClick={() => setNote(null)} className="opacity-70 hover:opacity-100"><X size={12} /></button>
          </p>
        )}
        {error && (
          <p className="text-danger text-sm px-4 py-3 flex items-center gap-2"><AlertCircle size={14} /> {error}</p>
        )}

        {currencies === null ? (
          <div className="flex justify-center py-10"><SpinningDots size="md" className="text-emerald-accent" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  {['Code', 'Name', '1 USD =', '1 GBP =', ''].map((h, i) => (
                    <th key={h || `col-${i}`} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currencies.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-theme-muted">No currencies yet. Add one or refresh from the API.</td></tr>
                )}
                {currencies.map((c) => {
                  const isUsd = c.code === 'USD';
                  const editing = editingId === c.id;
                  const canRemove = !PROTECTED.has(c.code);
                  return (
                    <tr key={c.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-theme-heading">{c.code}</td>
                      <td className="px-4 py-2.5 text-theme-heading">{c.name}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {isUsd ? (
                          <span className="text-theme-muted">1.00 (base)</span>
                        ) : editing ? (
                          <span className="inline-flex items-center gap-1.5">
                            <input type="number" step="any" min={0} autoFocus value={editRate}
                              onChange={(e) => setEditRate(e.target.value)}
                              className="input-field !py-1 !px-2 w-28 text-sm" />
                            <button type="button" disabled={rowBusy === c.id || editRate === ''} onClick={() => void saveRate(c)}
                              title="Save rate"
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-emerald-accent hover:bg-emerald-accent/10 disabled:opacity-40">
                              {rowBusy === c.id ? <SpinningDots size="sm" /> : <Check size={13} />}
                            </button>
                            <button type="button" onClick={() => setEditingId(null)} title="Cancel"
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading">
                              <X size={13} />
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span className="font-bold tabular-nums text-theme-heading">{fmtExchange(c.usd_rate)}</span>
                            <RateSourceChip source={c.usd_rate_source} />
                            <button type="button"
                              onClick={() => { setEditingId(c.id); setEditRate(c.usd_rate != null ? String(c.usd_rate) : ''); }}
                              title="Edit rate"
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5">
                              <Pencil size={12} />
                            </button>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-theme-muted whitespace-nowrap">{fmtExchange(c.gbp_rate)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(c)}
                            title={`Remove ${c.code}`}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!removeTarget}
        title="Remove this currency?"
        body={
          removeTarget ? (
            <>
              Remove <span className="font-semibold text-theme-heading">{removeTarget.code}</span>
              {' '}({removeTarget.name}) from the catalog? Existing payslips keep their saved rates.
            </>
          ) : null
        }
        confirmLabel="Remove"
        tone="danger"
        icon={Trash2}
        busy={removing}
        onCancel={() => { if (!removing) setRemoveTarget(null); }}
        onConfirm={() => void confirmRemove()}
      />
    </div>
  );
}
