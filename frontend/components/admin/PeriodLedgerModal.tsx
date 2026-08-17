'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Save, X } from 'lucide-react';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

interface PayrollSummary {
  id: string;
  worker_id: string;
  hours_logged: string | number;
  rate_per_hour: string | number;
  bonus: string | number;
  transfer_cost: string | number;
  external_cost: string | number;
  final_net: string | number;
  gross_earned: string | number;
  local_currency: string;
  fx_rate: string | number | null;
  admin_locked?: boolean;
  suggested_hours?: string | number | null;
  evidence_incomplete?: boolean | null;
}

interface LedgerRow {
  worker_id: string;
  worker_display_name: string;
  worker_country: string;
  worker_type: string | null;
  worker_pay_tier: string | null;
  suggested_hours: string | number;
  evidence_incomplete: boolean;
  session_count?: number;
  summary: PayrollSummary | null;
}

interface EditRow {
  worker_id: string;
  rate_per_hour: string;
  bonus: string;
  transfer_cost: string;
  external_cost: string;
  fx_rate: string;
  selected: boolean;
}

interface Props {
  periodId: string;
  periodLabel: string;
  locked: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function toEdit(row: LedgerRow): EditRow {
  const s = row.summary;
  return {
    worker_id: row.worker_id,
    rate_per_hour: String(s?.rate_per_hour ?? '0'),
    bonus: String(s?.bonus ?? '0'),
    transfer_cost: String(s?.transfer_cost ?? '0'),
    external_cost: String(s?.external_cost ?? '0'),
    fx_rate: s?.fx_rate != null ? String(s.fx_rate) : '',
    selected: false,
  };
}

export default function PeriodLedgerModal({ periodId, periodLabel, locked, onClose, onSaved }: Props) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [edits, setEdits] = useState<Record<string, EditRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [bulk, setBulk] = useState({
    transfer_cost: '',
    external_cost: '',
    rate_per_hour: '',
    fx_rate: '',
  });

  const load = useCallback(() => {
    setLoading(true);
    api.get<LedgerRow[]>(`/payroll/periods/${periodId}/ledger`)
      .then((data) => {
        setRows(data);
        const map: Record<string, EditRow> = {};
        data.forEach((r) => { map[r.worker_id] = toEdit(r); });
        setEdits(map);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load ledger'))
      .finally(() => setLoading(false));
  }, [periodId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.worker_display_name.toLowerCase().includes(q) ||
      r.worker_country.toLowerCase().includes(q) ||
      (r.worker_pay_tier || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const setField = (workerId: string, key: keyof EditRow, value: string | boolean) => {
    setEdits((prev) => ({
      ...prev,
      [workerId]: { ...prev[workerId], [key]: value },
    }));
  };

  const applyBulk = (scope: 'selected' | 'visible') => {
    const targets = scope === 'selected'
      ? visible.filter((r) => edits[r.worker_id]?.selected)
      : visible;
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of targets) {
        const e = { ...next[r.worker_id] };
        if (bulk.transfer_cost !== '') e.transfer_cost = bulk.transfer_cost;
        if (bulk.external_cost !== '') e.external_cost = bulk.external_cost;
        if (bulk.rate_per_hour !== '') e.rate_per_hour = bulk.rate_per_hour;
        if (bulk.fx_rate !== '') e.fx_rate = bulk.fx_rate;
        next[r.worker_id] = e;
      }
      return next;
    });
  };

  const save = async () => {
    if (locked) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        upsert: true,
        rows: Object.values(edits).map((e) => ({
          worker_id: e.worker_id,
          rate_per_hour: Number(e.rate_per_hour || 0),
          bonus: Number(e.bonus || 0),
          transfer_cost: Number(e.transfer_cost || 0),
          external_cost: Number(e.external_cost || 0),
          ...(e.fx_rate !== '' ? { fx_rate: Number(e.fx_rate) } : {}),
          admin_locked: true,
        })),
      };
      await api.post(`/payroll/periods/${periodId}/summaries/bulk`, payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="glass-modal relative z-10 flex flex-col w-full max-w-[min(1400px,calc(100vw-1.5rem))] max-h-[min(92vh,calc(100dvh-1.5rem))] overflow-hidden rounded-2xl">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-white/[0.06] shrink-0 min-w-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-bold text-white truncate">Period ledger — {periodLabel}</h2>
            <p className="text-xs text-theme-muted mt-0.5">
              Editable anytime while the period is open. Hours come from session start/end times. Set rate, bonus, and costs — receipts use hours × rate.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        {!locked && (
          <div className="p-3 sm:px-5 border-b border-white/[0.06] space-y-2 shrink-0 bg-white/[0.02]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Bulk apply (same values for many workers)</p>
            <div className="flex flex-wrap gap-2 items-end">
              {([
                ['rate_per_hour', 'Rate/hr'],
                ['transfer_cost', 'Transfer'],
                ['external_cost', 'External'],
                ['fx_rate', 'FX rate'],
              ] as const).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-[9px] text-theme-muted">{label}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={bulk[key]}
                    onChange={(e) => setBulk((b) => ({ ...b, [key]: e.target.value }))}
                    className="input-field !py-1.5 w-24 text-xs"
                  />
                </label>
              ))}
              <button type="button" onClick={() => applyBulk('selected')} className="btn-secondary text-xs py-1.5 px-3">Apply → selected</button>
              <button type="button" onClick={() => applyBulk('visible')} className="btn-secondary text-xs py-1.5 px-3">Apply → visible</button>
            </div>
          </div>
        )}

        <div className="px-3 sm:px-5 py-2 border-b border-white/[0.06] shrink-0">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workers…"
            className="input-field !py-1.5 text-sm w-full max-w-sm"
          />
        </div>

        {error && (
          <div className="mx-3 sm:mx-5 mt-2 flex items-center gap-2 p-2 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0 overscroll-contain">
          {loading ? (
            <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
          ) : (
            <div className="min-w-0 overflow-x-auto">
            <table className="w-full text-xs min-w-[1100px]">
              <thead className="sticky top-0 bg-brand-surface-lowest z-10">
                <tr className="border-b border-white/[0.08]">
                  <th className="px-2 py-2 text-left"><input type="checkbox" onChange={(e) => {
                    const checked = e.target.checked;
                    setEdits((prev) => {
                      const next = { ...prev };
                      visible.forEach((r) => { next[r.worker_id] = { ...next[r.worker_id], selected: checked }; });
                      return next;
                    });
                  }} /></th>
                  <th className="text-left px-2 py-2 text-theme-muted">Worker</th>
                  <th className="text-left px-2 py-2 text-theme-muted">Tier</th>
                  <th className="text-right px-2 py-2 text-theme-muted">Hours</th>
                  <th className="text-right px-2 py-2 text-theme-muted">Sessions</th>
                  <th className="text-right px-2 py-2 text-theme-muted">Rate/hr</th>
                  <th className="text-right px-2 py-2 text-theme-muted">Bonus</th>
                  <th className="text-right px-2 py-2 text-theme-muted">Transfer</th>
                  <th className="text-right px-2 py-2 text-theme-muted">External</th>
                  <th className="text-right px-2 py-2 text-theme-muted">FX</th>
                  <th className="text-right px-2 py-2 text-theme-muted">Net</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const e = edits[r.worker_id];
                  if (!e) return null;
                  return (
                    <tr key={r.worker_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={e.selected} onChange={(ev) => setField(r.worker_id, 'selected', ev.target.checked)} disabled={locked} />
                      </td>
                      <td className="px-2 py-1.5">
                        <p className="text-white font-medium">{r.worker_display_name}</p>
                        <p className="text-[10px] text-theme-muted">{r.worker_country} · {r.worker_type === 'partner_worker' ? 'Partner' : 'GS'}</p>
                        {r.evidence_incomplete && (
                          <p className="text-[9px] text-amber-400">Evidence incomplete</p>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-theme-muted">{r.worker_pay_tier || '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-theme-heading">{Number(r.suggested_hours).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right text-theme-muted">{r.session_count ?? 0}</td>
                      {(['rate_per_hour', 'bonus', 'transfer_cost', 'external_cost', 'fx_rate'] as const).map((key) => (
                        <td key={key} className="px-1 py-1">
                          <input
                            type="number"
                            step="0.01"
                            disabled={locked}
                            value={e[key]}
                            onChange={(ev) => setField(r.worker_id, key, ev.target.value)}
                            className="input-field !py-1 !px-1.5 w-20 text-right text-xs"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right text-emerald-accent font-semibold">
                        {r.summary ? Number(r.summary.final_net).toFixed(2) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 sm:p-5 border-t border-white/[0.06] shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Close</button>
          {!locked && (
            <button type="button" disabled={saving} onClick={save} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
              <Save size={14} /> {saving ? 'Saving…' : 'Save ledger'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
