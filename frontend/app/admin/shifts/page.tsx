'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, X } from 'lucide-react';
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

function formatDt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function duration(start: string, end: string): string {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const STATUS_OPTIONS = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
const STATUS_VALUES: Record<string, string> = {
  Pending: 'pending', Approved: 'approved', Rejected: 'rejected', Cancelled: 'cancelled',
};

function localDateInputValue(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Shift overlaps the selected local calendar day (including overnight spans). */
function overlapsLocalDay(startIso: string, endIso: string, day: string): boolean {
  if (!day) return true;
  const dayStart = new Date(`${day}T00:00:00`).getTime();
  const dayEnd = new Date(`${day}T00:00:00`);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const shiftStart = new Date(startIso).getTime();
  const shiftEnd = new Date(endIso).getTime();
  if (!Number.isFinite(shiftStart) || !Number.isFinite(shiftEnd)) return false;
  return shiftStart < dayEnd.getTime() && shiftEnd > dayStart;
}

function formatDayLabel(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function AdminShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [day, setDay] = useState('');
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sv = statusFilter ? STATUS_VALUES[statusFilter] : '';
    return shifts.filter((s) => {
      if (sv && s.status !== sv) return false;
      if (!overlapsLocalDay(s.scheduled_start, s.scheduled_end, day)) return false;
      if (!q) return true;
      const w = workerMap[s.worker_id];
      const name = w ? w.display_name.toLowerCase() : s.worker_id;
      return name.includes(q) || s.status.includes(q);
    });
  }, [shifts, day, statusFilter, search, workerMap]);

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
      start: formatDt(s.scheduled_start),
      end: formatDt(s.scheduled_end),
      duration: duration(s.scheduled_start, s.scheduled_end),
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
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-theme-muted shrink-0" />
          <label htmlFor="shifts-day" className="sr-only">Day</label>
          <input
            id="shifts-day"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="px-3 py-2.5 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40 [color-scheme:dark]"
          />
          <button
            type="button"
            onClick={() => setDay(localDateInputValue())}
            className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
              day === localDateInputValue()
                ? 'bg-emerald-accent/20 text-emerald-400 border-emerald-accent/40'
                : 'bg-white/5 text-theme-muted border-white/10 hover:text-white hover:border-white/20'
            }`}
          >
            Today
          </button>
          {day && (
            <button
              type="button"
              onClick={() => setDay('')}
              className="text-xs text-theme-muted hover:text-white underline underline-offset-2"
            >
              All days
            </button>
          )}
        </div>
      </FilterBar>
      {day && (
        <p className="-mt-4 mb-4 text-xs text-theme-muted">
          Showing {filtered.length} shift{filtered.length === 1 ? '' : 's'} on {formatDayLabel(day)}.
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
            { key: 'start', header: 'Start' },
            { key: 'end', header: 'End' },
            { key: 'duration', header: 'Duration' },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <StatusBadge status={r.status as string} />,
            },
            {
              key: 'actions',
              header: '',
              render: (r) => {
                const raw = (r as typeof rows[number])._raw;
                if (raw.status !== 'pending') return null;
                return (
                  <div className="flex items-center gap-2">
                    <button
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-accent hover:underline disabled:opacity-40"
                      onClick={() => handleApprove(raw.id)}
                      disabled={!!actioning}
                    >
                      <Check size={13} /> Approve
                    </button>
                    <button
                      className="flex items-center gap-1 text-xs font-semibold text-danger hover:underline disabled:opacity-40"
                      onClick={() => setRejectingId(raw.id)}
                      disabled={!!actioning}
                    >
                      <X size={13} /> Reject
                    </button>
                  </div>
                );
              },
            },
          ]}
          data={rows as unknown as Record<string, unknown>[]}
          emptyMessage={day ? `No shifts on ${formatDayLabel(day)}.` : 'No shifts found.'}
        />
      )}
    </div>
  );
}
