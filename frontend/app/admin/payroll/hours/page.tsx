'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Download, Plus, RotateCcw, Search, Trash2, Upload } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import PeriodFilter from '@/components/platform/PeriodFilter';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { pickCurrentPeriod } from '@/lib/periods';

interface Period {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
  is_current?: boolean;
}

interface LogRow {
  id: string;
  worker_id: string;
  worker_name: string;
  rdp_resource_id: string | null;
  desktop: string | null;
  client_id: string | null;
  client_name: string | null;
  hours: string;
  session_hours: string;
  is_manual: boolean;
  note: string | null;
}

interface Option {
  id: string;
  name: string;
  client_name?: string | null;
}

interface Sheet {
  period_id: string;
  period_label: string;
  status: string;
  editable: boolean;
  rows: LogRow[];
  workers: Option[];
  desktops: Option[];
}

interface ImportResult {
  updated: number;
  skipped: number;
  errors: string[];
}

type GroupBy = 'worker' | 'desktop' | 'client';

const NO_DESKTOP = 'No desktop';
const NO_CLIENT = 'No client';

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const fmt = (v: number) => v.toFixed(2);

function groupKey(row: LogRow, by: GroupBy): string {
  if (by === 'desktop') return row.desktop ?? NO_DESKTOP;
  if (by === 'client') return row.client_name ?? NO_CLIENT;
  return row.worker_name;
}

function HoursCell({ row, editable, onSave }: { row: LogRow; editable: boolean; onSave: (hours: string) => void }) {
  const [value, setValue] = useState(fmt(num(row.hours)));
  useEffect(() => setValue(fmt(num(row.hours))), [row.hours]);
  const commit = () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setValue(fmt(num(row.hours)));
      return;
    }
    if (fmt(n) !== fmt(num(row.hours))) onSave(fmt(n));
  };
  return (
    <input
      type="number"
      min={0}
      step="0.25"
      value={value}
      disabled={!editable}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={`input-field py-1 px-2 w-24 text-right tabular-nums ${row.is_manual ? 'border-amber-400/40' : ''}`}
      aria-label={`Hours for ${row.worker_name} on ${row.desktop ?? NO_DESKTOP}`}
    />
  );
}

export default function HoursLogPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('worker');
  const [onlyTyped, setOnlyTyped] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ worker_id: '', rdp_resource_id: '', hours: '', note: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<Period[]>('/payroll/periods')
      .then((list) => {
        setPeriods(list);
        const wanted = new URLSearchParams(window.location.search).get('period');
        const pick = list.find((p) => p.id === wanted) ?? pickCurrentPeriod(list) ?? list[0];
        if (pick) setPeriodId(pick.id);
        else setLoading(false);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Failed to load work months'); setLoading(false); });
  }, []);

  const load = useCallback(() => {
    if (!periodId) return;
    setLoading(true);
    api.get<Sheet>(`/hours-log/periods/${periodId}`)
      .then(setSheet)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load hours'))
      .finally(() => setLoading(false));
  }, [periodId]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<Sheet>, done?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setSheet(await fn());
      if (done) setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const saveRow = (row: LogRow, hours: string) =>
    act(() => api.put<Sheet>(`/hours-log/periods/${periodId}/entries`, {
      worker_id: row.worker_id, rdp_resource_id: row.rdp_resource_id, hours, note: row.note,
    }), `Saved ${row.worker_name} · ${row.desktop ?? NO_DESKTOP}.`);

  const addRow = async () => {
    if (!draft.worker_id || draft.hours === '') return;
    await act(() => api.put<Sheet>(`/hours-log/periods/${periodId}/entries`, {
      worker_id: draft.worker_id,
      rdp_resource_id: draft.rdp_resource_id || null,
      hours: draft.hours,
      note: draft.note || null,
    }), 'Hours added.');
    setDraft({ worker_id: '', rdp_resource_id: '', hours: '', note: '' });
    setAdding(false);
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.upload<ImportResult>(`/hours-log/periods/${periodId}/import`, fd);
      setNotice(
        `Imported ${res.updated} row${res.updated === 1 ? '' : 's'}`
        + (res.skipped ? `, skipped ${res.skipped}` : '')
        + (res.errors.length ? ` — ${res.errors.slice(0, 3).join('; ')}` : '.'),
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const lines = ['Worker,Desktop,Hours,Note'];
    const seen = new Set<string>();
    for (const r of sheet?.rows ?? []) {
      const key = `${r.worker_name}|${r.desktop ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push([r.worker_name, r.desktop ?? '', fmt(num(r.hours)), ''].map((c) => `"${c.replace(/"/g, '""')}"`).join(','));
    }
    if (lines.length === 1) lines.push('"Worker name","Desktop nickname (blank = No desktop)","0.00",""');
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hours-log-${sheet?.period_label ?? 'month'}.csv`.replace(/\s+/g, '-');
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const rows = sheet?.rows ?? [];
  const editable = !!sheet?.editable;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyTyped && !r.is_manual) return false;
      if (!q) return true;
      return [r.worker_name, r.desktop, r.client_name].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [rows, search, onlyTyped]);

  const groups = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    for (const r of visible) {
      const k = groupKey(r, groupBy);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const tail = (s: string) => s === NO_DESKTOP || s === NO_CLIENT;
      if (tail(a) !== tail(b)) return tail(a) ? 1 : -1;
      return a.localeCompare(b);
    });
  }, [visible, groupBy]);

  const totalHours = rows.reduce((s, r) => s + num(r.hours), 0);
  const totalSession = rows.reduce((s, r) => s + num(r.session_hours), 0);
  const typedCount = rows.filter((r) => r.is_manual).length;

  return (
    <div>
      <PageHeader
        title="Hours Log"
        description="Paid hours per worker per desktop for the working month. Rows fill from session screenshot times; type over any figure and the worker's payslip follows the new total."
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      <div className="glass-panel p-4 mb-6 grid gap-4 sm:grid-cols-2 items-end">
        <PeriodFilter periods={periods} value={periodId} onChange={setPeriodId} variant="select" label="Working month" />
        {sheet && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button type="button" onClick={downloadTemplate} className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
              <Download size={13} /> Template
            </button>
            <button
              type="button"
              disabled={!editable || busy}
              onClick={() => fileRef.current?.click()}
              className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
            >
              <Upload size={13} /> Import CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }}
            />
            <button
              type="button"
              disabled={!editable || busy}
              onClick={() => setAdding((v) => !v)}
              className="btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5"
            >
              <Plus size={13} /> Add hours
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-sm">
          <Check size={14} /> {notice}
        </div>
      )}
      {sheet && !editable && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-white/[0.04] border border-white/10 text-theme-muted text-sm">
          <AlertCircle size={14} /> {sheet.period_label} is paid, so its hours are locked.
        </div>
      )}

      {adding && sheet && (
        <div className="glass-panel p-4 mb-6 grid gap-3 sm:grid-cols-5 items-end">
          <label className="text-xs text-theme-muted space-y-1">
            <span>Worker</span>
            <select value={draft.worker_id} onChange={(e) => setDraft({ ...draft, worker_id: e.target.value })} className="input-field w-full">
              <option value="">Choose…</option>
              {sheet.workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-theme-muted space-y-1">
            <span>Desktop</span>
            <select value={draft.rdp_resource_id} onChange={(e) => setDraft({ ...draft, rdp_resource_id: e.target.value })} className="input-field w-full">
              <option value="">{NO_DESKTOP}</option>
              {sheet.desktops.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.client_name ? ` · ${d.client_name}` : ''}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-theme-muted space-y-1">
            <span>Hours</span>
            <input type="number" min={0} step="0.25" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} className="input-field w-full" />
          </label>
          <label className="text-xs text-theme-muted space-y-1">
            <span>Note</span>
            <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="input-field w-full" placeholder="Optional" />
          </label>
          <button
            type="button"
            disabled={busy || !draft.worker_id || draft.hours === ''}
            onClick={() => void addRow()}
            className="btn-primary text-sm py-2 px-4"
          >
            Save
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : !sheet ? (
        <p className="text-theme-muted text-sm">No working months yet.</p>
      ) : (
        <div className="glass-panel p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-theme-muted">
            <span>Paid hours <span className="text-theme-heading font-semibold tabular-nums">{fmt(totalHours)}</span></span>
            <span>From sessions <span className="text-theme-heading font-semibold tabular-nums">{fmt(totalSession)}</span></span>
            <span>Typed rows <span className="text-amber-400 font-semibold">{typedCount}</span></span>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search worker, desktop or client…" className="input-field pl-9 w-full" />
            </div>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="input-field w-full sm:w-auto" aria-label="Group by">
              <option value="worker">Group by worker</option>
              <option value="desktop">Group by desktop</option>
              <option value="client">Group by client</option>
            </select>
            <label className="flex items-center gap-2 text-sm cursor-pointer px-2">
              <input type="checkbox" checked={onlyTyped} onChange={(e) => setOnlyTyped(e.target.checked)} />
              Typed only
            </label>
          </div>

          <div className="max-h-[65vh] overflow-y-auto rounded-xl border border-white/10">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="sticky top-0 bg-brand-surface-lowest z-10">
                <tr className="border-b border-white/[0.06]">
                  {['Worker', 'Desktop', 'Client', 'From sessions', 'Paid hours', 'Note', ''].map((h) => (
                    <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase text-theme-muted ${h === 'From sessions' || h === 'Paid hours' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-theme-muted text-xs">No hours logged this month.</td></tr>
                ) : groups.map(([label, list]) => (
                  <GroupRows
                    key={label}
                    label={label}
                    rows={list}
                    editable={editable && !busy}
                    onSave={saveRow}
                    onReset={(r) => act(() => api.post<Sheet>(`/hours-log/entries/${r.id}/reset`, {}), 'Back to session hours.')}
                    onDelete={(r) => act(() => api.delete<Sheet>(`/hours-log/entries/${r.id}`), 'Row removed.')}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupRows({
  label, rows, editable, onSave, onReset, onDelete,
}: {
  label: string;
  rows: LogRow[];
  editable: boolean;
  onSave: (row: LogRow, hours: string) => void;
  onReset: (row: LogRow) => void;
  onDelete: (row: LogRow) => void;
}) {
  const hours = rows.reduce((s, r) => s + num(r.hours), 0);
  const session = rows.reduce((s, r) => s + num(r.session_hours), 0);
  return (
    <>
      <tr className="bg-white/[0.03] border-b border-white/[0.06]">
        <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-theme-heading">{label}</td>
        <td className="px-3 py-1.5 text-xs text-right tabular-nums text-theme-muted">{fmt(session)}</td>
        <td className="px-3 py-1.5 text-xs text-right tabular-nums font-semibold text-theme-heading">{fmt(hours)}</td>
        <td colSpan={2} />
      </tr>
      {rows.map((r) => {
        const differs = r.is_manual && fmt(num(r.hours)) !== fmt(num(r.session_hours));
        return (
          <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
            <td className="px-3 py-2 text-theme-heading">{r.worker_name}</td>
            <td className="px-3 py-2 text-theme-muted">{r.desktop ?? NO_DESKTOP}</td>
            <td className="px-3 py-2 text-theme-muted">{r.client_name ?? '—'}</td>
            <td className="px-3 py-2 text-right tabular-nums text-theme-muted">{fmt(num(r.session_hours))}</td>
            <td className="px-3 py-2">
              <div className="flex items-center justify-end gap-2">
                {r.is_manual && (
                  <span
                    className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border text-amber-400 border-amber-400/30 bg-amber-400/10"
                    title={differs ? 'Typed by an admin; differs from sessions' : 'Typed by an admin'}
                  >
                    Typed
                  </span>
                )}
                <HoursCell row={r} editable={editable} onSave={(h) => onSave(r, h)} />
              </div>
            </td>
            <td className="px-3 py-2 text-xs text-theme-muted max-w-[200px] truncate" title={r.note ?? ''}>{r.note ?? ''}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">
              {r.is_manual && num(r.session_hours) > 0 && (
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => onReset(r)}
                  className="p-1.5 rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5"
                  title="Back to session hours"
                >
                  <RotateCcw size={13} />
                </button>
              )}
              {num(r.session_hours) === 0 && (
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => onDelete(r)}
                  className="p-1.5 rounded-lg text-theme-muted hover:text-danger hover:bg-danger/10"
                  title="Remove this row"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
