'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
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
  rejection_reason: string | null;
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

export default function AdminShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
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
      if (!q) return true;
      const w = workerMap[s.worker_id];
      const name = w ? w.display_name.toLowerCase() : s.worker_id;
      return name.includes(q) || s.status.includes(q);
    });
  }, [shifts, workers, statusFilter, search, workerMap]);

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
      await api.patch<Shift>(`/shifts/${id}`, {
        status: 'rejected',
        rejection_reason: rejectionReason.trim() || null,
      });
      setRejectingId(null);
      setRejectionReason('');
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
      rejection_reason: s.rejection_reason ?? '—',
      _raw: s,
    };
  });

  return (
    <div>
      <PageHeader
        title="Shifts"
        description="Review and approve worker schedule submissions."
      />
      <FilterBar
        searchPlaceholder="Search by worker name…"
        onSearch={setSearch}
        onFilterChange={(label, value) => { if (label === 'Status') setStatusFilter(value); }}
        filters={[{ label: 'Status', options: STATUS_OPTIONS }]}
      />

      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-panel rounded-2xl border border-white/10 p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-white">Reject Shift</h3>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-theme-muted">Reason (optional)</label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Shift conflicts with operational hours"
                className="bg-brand-surface-high border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-danger/50 resize-none"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                className="btn-secondary"
                onClick={() => { setRejectingId(null); setRejectionReason(''); }}
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
            { key: 'rejection_reason', header: 'Rejection Reason' },
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
                      onClick={() => { setRejectingId(raw.id); setRejectionReason(''); }}
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
          emptyMessage="No shifts found."
        />
      )}
    </div>
  );
}
