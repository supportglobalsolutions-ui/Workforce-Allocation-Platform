'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Loader2, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';

interface Worker {
  id: string;
  display_name: string;
  country: string;
}

interface Shift {
  id: string;
  worker_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  approved_at: string | null;
  rdp_resource_id: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  return `${weekday} ${d.getDate()} ${month} ${d.getFullYear()}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function durationHours(start: string, end: string): string {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 0) return '—';
  if (mins < 60) return `${mins} min`;
  const hours = mins / 60;
  const rounded = Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'hr' : 'hrs'}`;
}

const STATUS_OPTIONS = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
const STATUS_VALUES: Record<string, string> = {
  Pending: 'pending', Approved: 'approved', Rejected: 'rejected', Cancelled: 'cancelled',
};

type RangeKey = 'all' | '24h' | '3d' | '7d' | 'this_week' | 'next_7d' | '1m' | 'custom';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '24h', label: 'Last 24 hours' },
  { key: '3d', label: 'Last 3 days' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'this_week', label: 'This week (Mon–Sun)' },
  { key: 'next_7d', label: 'Next 7 days' },
  { key: '1m', label: 'Last month' },
  { key: 'custom', label: 'Custom range' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

interface Bounds { from: number; to: number }

/** Midnight at the start of today, local time. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** `base` moved by whole calendar days (DST-safe, unlike adding DAY_MS). */
function shiftDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Window the table should cover, or null for "no limit".
 *
 * Every window is matched against the shift's *scheduled* time — the day the
 * worker says they will be working — not when the row was submitted. Because
 * workers submit ahead (a shift for the whole week can land on Monday), the
 * backward-looking options run to the END of today rather than to "now", so a
 * shift scheduled for later today still counts as today. "This week" and
 * "Next 7 days" deliberately reach into the future for those advance
 * submissions. Custom takes whole local days, with the end day included.
 */
function rangeBounds(key: RangeKey, customFrom: string, customTo: string): Bounds | null {
  if (key === 'all') return null;
  if (key === 'custom') {
    if (!customFrom && !customTo) return null;
    const from = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : -Infinity;
    let to = Infinity;
    if (customTo) {
      const end = new Date(`${customTo}T00:00:00`);
      end.setDate(end.getDate() + 1);
      to = end.getTime();
    }
    return { from, to };
  }

  const today = startOfToday();
  const endOfToday = shiftDays(today, 1).getTime();

  switch (key) {
    case '24h':
      return { from: Date.now() - DAY_MS, to: endOfToday };
    case '3d':
      return { from: shiftDays(today, -2).getTime(), to: endOfToday };
    case '7d':
      return { from: shiftDays(today, -6).getTime(), to: endOfToday };
    case '1m':
      return { from: shiftDays(today, -29).getTime(), to: endOfToday };
    case 'this_week': {
      const weekday = today.getDay(); // 0 = Sunday
      const monday = shiftDays(today, weekday === 0 ? -6 : 1 - weekday);
      return { from: monday.getTime(), to: shiftDays(monday, 7).getTime() };
    }
    case 'next_7d':
      return { from: today.getTime(), to: shiftDays(today, 7).getTime() };
    default:
      return null;
  }
}

/** True when the shift overlaps the window at all, overnight spans included. */
function overlapsRange(startIso: string, endIso: string, bounds: Bounds | null): boolean {
  if (!bounds) return true;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start < bounds.to && end > bounds.from;
}

/** Placeholder that keeps the action columns aligned on already-decided rows. */
function IdleCell() {
  return <span className="text-theme-muted/40">—</span>;
}

export default function AdminShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<RangeKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const reload = () => {
    return Promise.all([
      api.get<Shift[]>('/shifts'),
      api.get<Worker[]>('/workers'),
    ]).then(([s, w]) => { setShifts(s); setWorkers(w); });
  };

  useEffect(() => {
    reload()
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const workerMap = useMemo(() => {
    const m: Record<string, Worker> = {};
    workers.forEach((w) => { m[w.id] = w; });
    return m;
  }, [workers]);

  /**
   * Only workers who actually submitted a shift, so the dropdown stays short
   * and every option is guaranteed to return rows.
   */
  const submitters = useMemo(() => {
    const counts = new Map<string, number>();
    shifts.forEach((s) => counts.set(s.worker_id, (counts.get(s.worker_id) ?? 0) + 1));
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        name: workerMap[id]?.display_name ?? `${id.slice(0, 8)}…`,
        count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [shifts, workerMap]);

  const bounds = useMemo(
    () => rangeBounds(range, customFrom, customTo),
    [range, customFrom, customTo],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sv = statusFilter ? STATUS_VALUES[statusFilter] : '';
    return shifts.filter((s) => {
      if (sv && s.status !== sv) return false;
      if (workerFilter && s.worker_id !== workerFilter) return false;
      if (!overlapsRange(s.scheduled_start, s.scheduled_end, bounds)) return false;
      if (!q) return true;
      const w = workerMap[s.worker_id];
      const name = w ? w.display_name.toLowerCase() : s.worker_id;
      return name.includes(q) || s.status.includes(q);
    });
  }, [shifts, bounds, statusFilter, workerFilter, search, workerMap]);

  const selectedWorker = submitters.find((w) => w.id === workerFilter) ?? null;
  const rangeLabel = RANGE_OPTIONS.find((o) => o.key === range)?.label ?? 'All time';

  const handleApprove = async (id: string) => {
    setActioning(id);
    try {
      await api.patch<Shift>(`/shifts/${id}`, {
        status: 'approved',
        approved_at: new Date().toISOString(),
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve');
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async (id: string) => {
    setActioning(id);
    try {
      await api.patch<Shift>(`/shifts/${id}`, { status: 'rejected' });
      setRejectingId(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject');
    } finally {
      setActioning(null);
    }
  };

  const rows = filtered.map((s) => {
    const w = workerMap[s.worker_id];
    return {
      id: s.id,
      worker: w ? `${w.display_name} (${w.country})` : s.worker_id.slice(0, 8) + '…',
      date: formatDate(s.scheduled_start),
      start: formatTime(s.scheduled_start),
      end: formatTime(s.scheduled_end),
      hours: durationHours(s.scheduled_start, s.scheduled_end),
      status: s.status,
      _raw: s,
    };
  });

  return (
    <div>
      <PageHeader
        title="Shifts"
      />
      <FilterBar
        searchPlaceholder="Search by worker name…"
        onSearch={setSearch}
        onFilterChange={(label, value) => { if (label === 'Status') setStatusFilter(value); }}
        filters={[{ label: 'Status', options: STATUS_OPTIONS }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="shifts-worker" className="sr-only">Worker</label>
          <select
            id="shifts-worker"
            value={workerFilter}
            onChange={(e) => setWorkerFilter(e.target.value)}
            className="px-4 py-2.5 bg-brand-surface-container/60 border border-emerald-accent/30 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent transition-colors max-w-[16rem]"
          >
            <option value="">All workers ({submitters.length})</option>
            {submitters.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} — {w.count} shift{w.count === 1 ? '' : 's'}
              </option>
            ))}
          </select>

          <label htmlFor="shifts-range" className="sr-only">Date range</label>
          <select
            id="shifts-range"
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            className="px-4 py-2.5 bg-brand-surface-container/60 border border-emerald-accent/30 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent transition-colors"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>

          {range === 'custom' && (
            <>
              <div className="relative">
                <Calendar
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-accent pointer-events-none"
                />
                <label htmlFor="shifts-from" className="sr-only">Start date</label>
                <input
                  id="shifts-from"
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="pl-9 pr-3 py-2.5 bg-brand-surface-container/60 border border-emerald-accent/30 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent transition-colors"
                />
              </div>
              <span className="text-xs text-theme-muted">to</span>
              <div className="relative">
                <Calendar
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-accent pointer-events-none"
                />
                <label htmlFor="shifts-to" className="sr-only">End date</label>
                <input
                  id="shifts-to"
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="pl-9 pr-3 py-2.5 bg-brand-surface-container/60 border border-emerald-accent/30 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent transition-colors"
                />
              </div>
              {(customFrom || customTo) && (
                <button
                  type="button"
                  onClick={() => { setCustomFrom(''); setCustomTo(''); }}
                  className="text-xs text-emerald-accent hover:underline"
                >
                  Clear dates
                </button>
              )}
            </>
          )}
        </div>
      </FilterBar>
      {(bounds || workerFilter) && (
        <p className="-mt-4 mb-4 flex flex-wrap items-center gap-2 text-xs text-theme-muted">
          <span>
            Showing {filtered.length} shift{filtered.length === 1 ? '' : 's'}
            {selectedWorker ? ` for ${selectedWorker.name}` : ''}
            {bounds ? ` scheduled in ${rangeLabel.toLowerCase()}` : ''}.
          </span>
          <button
            type="button"
            onClick={() => { setWorkerFilter(''); setRange('all'); setCustomFrom(''); setCustomTo(''); }}
            className="text-emerald-accent hover:underline"
          >
            Clear filters
          </button>
        </p>
      )}

      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-panel rounded-2xl border border-white/10 p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-white">Reject Shift</h3>
            <p className="text-sm text-theme-muted">
              The worker will see this shift as rejected. This cannot be undone here.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="btn-secondary"
                onClick={() => setRejectingId(null)}
                disabled={!!actioning}
              >
                Cancel
              </button>
              <button
                className="btn-primary bg-danger/80 hover:bg-danger border-danger/60"
                onClick={() => handleReject(rejectingId)}
                disabled={!!actioning}
              >
                {actioning === rejectingId ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading shifts…</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : (
        <DataTable
          columns={[
            { key: 'worker', header: 'Worker' },
            { key: 'date', header: 'Date' },
            { key: 'start', header: 'Start' },
            { key: 'end', header: 'End' },
            { key: 'hours', header: 'Hours' },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <StatusBadge status={r.status as string} />,
            },
            {
              key: 'approve',
              header: 'Approve',
              align: 'center',
              render: (r) => {
                const row = r as typeof rows[number];
                if (row._raw.status !== 'pending') return <IdleCell />;
                return (
                  <button
                    type="button"
                    title={`Approve ${row.worker}`}
                    aria-label={`Approve shift for ${row.worker}`}
                    className="group inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent transition-all hover:bg-emerald-accent hover:text-brand-primary-dark hover:shadow-lg hover:shadow-emerald-accent/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-accent/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                    onClick={() => handleApprove(row._raw.id)}
                    disabled={!!actioning}
                  >
                    {actioning === row._raw.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Check size={17} strokeWidth={3} />
                    )}
                  </button>
                );
              },
            },
            {
              key: 'reject',
              header: 'Reject',
              align: 'center',
              render: (r) => {
                const row = r as typeof rows[number];
                if (row._raw.status !== 'pending') return <IdleCell />;
                return (
                  <button
                    type="button"
                    title={`Reject ${row.worker}`}
                    aria-label={`Reject shift for ${row.worker}`}
                    className="group inline-flex h-9 w-9 items-center justify-center rounded-xl border border-danger/40 bg-danger/10 text-danger transition-all hover:bg-danger hover:text-white hover:shadow-lg hover:shadow-danger/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                    onClick={() => setRejectingId(row._raw.id)}
                    disabled={!!actioning}
                  >
                    <X size={17} strokeWidth={3} />
                  </button>
                );
              },
            },
          ]}
          data={rows as unknown as Record<string, unknown>[]}
          emptyMessage={
            bounds || workerFilter
              ? `No shifts${selectedWorker ? ` for ${selectedWorker.name}` : ''}`
                + `${bounds ? ` scheduled in ${rangeLabel.toLowerCase()}` : ''}.`
                + ' Try a wider date range — shifts submitted for future days sit outside the backward-looking ranges.'
              : 'No shifts found.'
          }
        />
      )}
    </div>
  );
}
