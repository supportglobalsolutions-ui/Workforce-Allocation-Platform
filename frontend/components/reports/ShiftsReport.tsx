'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download } from 'lucide-react';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';

interface ShiftRow {
  id: string;
  worker_id: string;
  worker_name?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  kind?: string;
  rdp_nickname?: string | null;
}

type KindFilter = '' | 'shift' | 'rdp_claim';

const th = 'text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant';
const thRight = 'text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant';
const td = 'px-4 py-3 text-brand-on-surface';
const tdRight = 'px-4 py-3 text-brand-on-surface text-right font-mono text-xs';
const select = 'px-3 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-accent';

function hours(s: ShiftRow): number {
  const ms = new Date(s.scheduled_end).getTime() - new Date(s.scheduled_start).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 3_600_000 : 0;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Normal shifts and RDP claim shifts for the chosen work month (or all
 * months), with type / member / status filters and a CSV download.
 */
export default function ShiftsReport({
  range,
  label,
}: {
  /** Work-month dates (YYYY-MM-DD); null = every month. */
  range: { start: string; end: string } | null;
  label: string;
}) {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>('');
  const [member, setMember] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get<ShiftRow[]>('/shifts')
      .then(setShifts)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load shifts.'))
      .finally(() => setLoading(false));
  }, []);

  const inRange = useMemo(() => {
    if (!range) return shifts;
    const from = new Date(`${range.start}T00:00:00`).getTime();
    const to = new Date(`${range.end}T23:59:59`).getTime();
    return shifts.filter((s) => {
      const t = new Date(s.scheduled_start).getTime();
      return t >= from && t <= to;
    });
  }, [shifts, range]);

  const members = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of inRange) map.set(s.worker_id, s.worker_name ?? s.worker_id.slice(0, 8));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [inRange]);

  const rows = useMemo(() => inRange
    .filter((s) => (!kind || (s.kind ?? 'shift') === kind)
      && (!member || s.worker_id === member)
      && (!status || s.status === status))
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)), [inRange, kind, member, status]);

  const totals = useMemo(() => {
    const t = { normal: 0, claim: 0, normalHours: 0, claimHours: 0 };
    for (const s of rows) {
      if (s.kind === 'rdp_claim') { t.claim += 1; t.claimHours += hours(s); } else { t.normal += 1; t.normalHours += hours(s); }
    }
    return t;
  }, [rows]);

  const download = () => {
    const header = ['Worker', 'Type', 'RDP', 'Date', 'Start', 'End', 'Hours', 'Status'];
    const lines = rows.map((s) => {
      const start = new Date(s.scheduled_start);
      const end = new Date(s.scheduled_end);
      return [
        s.worker_name ?? s.worker_id,
        s.kind === 'rdp_claim' ? 'RDP claim shift' : 'Shift',
        s.rdp_nickname ?? '',
        start.toLocaleDateString(),
        start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        hours(s).toFixed(2),
        s.status,
      ].map((v) => csvCell(String(v))).join(',');
    });
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shifts-${label.replace(/\s+/g, '-').toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
        <h2 className="text-sm font-bold text-theme-heading flex items-center gap-2">
          <span className="text-emerald-accent"><CalendarDays size={15} /></span> Shifts &amp; RDP claim shifts
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Shift type" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} className={select}>
            <option value="">All types</option>
            <option value="shift">Normal shifts</option>
            <option value="rdp_claim">RDP claim shifts</option>
          </select>
          <select aria-label="Member" value={member} onChange={(e) => setMember(e.target.value)} className={select}>
            <option value="">All members</option>
            {members.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
            <option value="">All statuses</option>
            {['pending', 'approved', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" onClick={download} disabled={!rows.length}
            className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 disabled:opacity-50">
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.04]">
        {[
          ['Normal shifts', String(totals.normal)],
          ['Normal hours', totals.normalHours.toFixed(1)],
          ['RDP claim shifts', String(totals.claim)],
          ['RDP claim hours', totals.claimHours.toFixed(1)],
        ].map(([k, v]) => (
          <div key={k} className="bg-brand-surface-container/40 px-5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">{k}</p>
            <p className="text-lg font-bold text-theme-heading tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0" style={{ background: 'var(--surface-container)' }}>
            <tr className="border-b border-white/5">
              <th className={th}>Worker</th>
              <th className={th}>Type</th>
              <th className={th}>Date</th>
              <th className={th}>Start</th>
              <th className={th}>End</th>
              <th className={thRight}>Hours</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-brand-on-surface-variant">Loading shifts…</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-danger">{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-brand-on-surface-variant">No shifts match these filters.</td></tr>
            ) : rows.map((s) => {
              const start = new Date(s.scheduled_start);
              const end = new Date(s.scheduled_end);
              return (
                <tr key={s.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className={`${td} font-medium text-theme-heading`}>{s.worker_name ?? '—'}</td>
                  <td className={td}>
                    {s.kind === 'rdp_claim' ? (
                      <span className="inline-flex items-center rounded-md border border-emerald-accent/30 bg-emerald-accent/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-accent whitespace-nowrap">
                        RDP · {s.rdp_nickname ?? 'desktop'}
                      </span>
                    ) : <span className="text-xs text-theme-muted">Shift</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{start.toLocaleDateString()}</td>
                  <td className={`${td} whitespace-nowrap`}>{start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className={`${td} whitespace-nowrap`}>{end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className={tdRight}>{hours(s).toFixed(2)}</td>
                  <td className={td}><StatusBadge status={s.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
