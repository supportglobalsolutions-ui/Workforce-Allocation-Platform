'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Download, Eye, Search, X } from 'lucide-react';

import DataTable from '@/components/platform/DataTable';
import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import SessionDetailPanel from '@/components/rdp/SessionDetailPanel';
import { api } from '@/lib/api';
import { ManagedUser, apiListUsers } from '@/lib/auth/firebase-auth';

interface WorkSession {
  id: string;
  worker_id: string;
  session_type: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  close_status: string | null;
  rdp_resource_id: string | null;
  start_image_url: string | null;
  end_image_url: string | null;
}

interface Worker {
  id: string;
  display_name: string;
  admin_user_id: string | null;
  email: string | null;
}

interface RDPResource {
  id: string;
  nickname: string;
}

interface SessionRow {
  id: string;
  date: string;
  start_time: string;
  session_type: string;
  worker: string;
  email: string;
  machine: string;
  duration: string;
  type: string;
  status: string;
  start_image_url: string | null;
  end_image_url: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

const STATUS_OPTIONS = ['Completed', 'Force Released', 'Abandoned'];
const STATUS_VALUES: Record<string, string> = {
  Completed: 'completed',
  'Force Released': 'force_released',
  Abandoned: 'abandoned',
};

type DateRange = 'Last 6 hours' | 'Last 7 days' | 'Last 30 days' | 'Custom' | '';
const DATE_RANGE_OPTIONS: Exclude<DateRange, ''>[] = [
  'Last 6 hours',
  'Last 7 days',
  'Last 30 days',
  'Custom',
];

function formatDuration(minutes: number | null): string {
  if (!minutes) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function passesDateFilter(
  startTime: string,
  range: DateRange,
  fromDate: string,
  toDate: string,
): boolean {
  if (!range) return true;
  const d = new Date(startTime).getTime();
  const now = Date.now();
  if (range === 'Last 6 hours') return d >= now - 6 * 3_600_000;
  if (range === 'Last 7 days') return d >= now - 7 * 86_400_000;
  if (range === 'Last 30 days') return d >= now - 30 * 86_400_000;
  if (range === 'Custom') {
    if (fromDate && d < new Date(fromDate).getTime()) return false;
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      if (d > end.getTime()) return false;
    }
    return true;
  }
  return true;
}

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [rdpResources, setRdpResources] = useState<RDPResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [emailSearch, setEmailSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<WorkSession[]>('/sessions?limit=500&include_images=false'),
      api.get<Worker[]>('/workers'),
      api.get<RDPResource[]>('/rdp'),
    ])
      .then(([sessionList, workerList, rdpList]) => {
        setSessions(sessionList);
        setWorkers(workerList);
        setRdpResources(rdpList);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load sessions'))
      .finally(() => setLoading(false));
  }, []);

  const workerMap = useMemo(
    () => Object.fromEntries(workers.map((w) => [w.id, w])),
    [workers],
  );

  const rdpMap = useMemo(
    () => Object.fromEntries(rdpResources.map((r) => [r.id, r])),
    [rdpResources],
  );

  const allRows = useMemo<SessionRow[]>(() => {
    return sessions.map((s) => {
      const worker = workerMap[s.worker_id];
      const email = worker?.email ?? '—';
      const machine = s.rdp_resource_id
        ? (rdpMap[s.rdp_resource_id]?.nickname ?? s.rdp_resource_id.slice(0, 8) + '…')
        : '—';
      return {
        id: s.id,
        date: new Date(s.start_time).toLocaleString(),
        start_time: s.start_time,
        session_type: s.session_type,
        worker: worker?.display_name ?? '—',
        email,
        machine,
        duration: formatDuration(s.duration_minutes),
        type: TYPE_LABELS[s.session_type] ?? s.session_type,
        status: s.close_status ?? (s.end_time ? 'completed' : 'pending'),
        start_image_url: s.start_image_url,
        end_image_url: s.end_image_url,
      };
    });
  }, [sessions, workerMap, rdpMap]);

  const filteredRows = useMemo(() => {
    const q = emailSearch.trim().toLowerCase();
    const statusVal = statusFilter ? (STATUS_VALUES[statusFilter] ?? statusFilter) : '';
    const typeVal = typeFilter
      ? (Object.entries(TYPE_LABELS).find(([, v]) => v === typeFilter)?.[0] ?? '')
      : '';

    return allRows.filter((r) => {
      if (statusVal && r.status !== statusVal) return false;
      if (typeVal && r.session_type !== typeVal) return false;
      if (!passesDateFilter(r.start_time, dateRange, customFrom, customTo)) return false;
      if (q) {
        const emailMatch = r.email.toLowerCase().includes(q);
        const nameMatch = r.worker.toLowerCase().includes(q);
        if (!emailMatch && !nameMatch) return false;
      }
      return true;
    });
  }, [allRows, emailSearch, dateRange, customFrom, customTo, statusFilter, typeFilter]);

  const handleEyeClick = async (rowId: string) => {
    const row = filteredRows.find((r) => r.id === rowId);
    if (!row) return;
    setLoadingSessionId(rowId);
    try {
      const full = await api.get<WorkSession>(`/sessions/${rowId}`);
      setSelectedSession({
        ...row,
        start_image_url: full.start_image_url,
        end_image_url: full.end_image_url,
      });
    } catch {
      setSelectedSession(row);
    } finally {
      setLoadingSessionId(null);
    }
  };

  const handleImageUploaded = (sessionId: string, type: 'start' | 'end', url: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, [`${type}_image_url`]: url } : s)),
    );
    setSelectedSession((prev) =>
      prev?.id === sessionId ? { ...prev, [`${type}_image_url`]: url } : prev,
    );
  };

  const handleExportCsv = () => {
    const headers = ['Date', 'Worker', 'Email', 'Machine', 'Duration', 'Type', 'Status'];
    const csvRows = filteredRows.map((r) =>
      [r.date, r.worker, r.email, r.machine, r.duration, r.type, r.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `all-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const workerLabel = selectedSession
    ? `${selectedSession.worker}${selectedSession.email !== '—' ? ` • ${selectedSession.email}` : ''}`
    : undefined;

  return (
    <div>
      <PageHeader
        title="All Sessions"
        description="Complete RDP session log across all users and all time."
        actions={
          <button className="btn-secondary flex items-center gap-2" onClick={handleExportCsv}>
            <Download size={16} />
            Export CSV
          </button>
        }
      />

      {/* ── Filters ── */}
      <div className="space-y-3 mb-6">
        {/* Row 1: email search + dropdowns */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant"
            />
            <input
              type="text"
              placeholder="Search by email or name…"
              value={emailSearch}
              onChange={(e) => setEmailSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white placeholder:text-brand-on-surface-variant/60 focus:outline-none focus:border-emerald-accent/40 transition-colors"
            />
            {emailSearch && (
              <button
                type="button"
                onClick={() => setEmailSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-white transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40"
          >
            <option value="">Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2.5 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40"
          >
            <option value="">Type</option>
            {Object.values(TYPE_LABELS).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Row 2: date range pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-theme-muted font-medium mr-1">Date range:</span>

          <button
            type="button"
            onClick={() => { setDateRange(''); setCustomFrom(''); setCustomTo(''); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
              dateRange === ''
                ? 'bg-emerald-accent/20 text-emerald-400 border-emerald-accent/40'
                : 'bg-white/5 text-theme-muted border-white/10 hover:text-white hover:border-white/20'
            }`}
          >
            All time
          </button>

          {DATE_RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setDateRange(r);
                if (r !== 'Custom') { setCustomFrom(''); setCustomTo(''); }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                dateRange === r
                  ? 'bg-emerald-accent/20 text-emerald-400 border-emerald-accent/40'
                  : 'bg-white/5 text-theme-muted border-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Row 3: custom date pickers */}
        {dateRange === 'Custom' && (
          <div className="flex flex-wrap items-center gap-4 pl-1">
            <div className="flex items-center gap-2">
              <Calendar size={13} className="text-theme-muted shrink-0" />
              <label className="text-xs text-theme-muted">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40 [color-scheme:dark]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-theme-muted">To</label>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40 [color-scheme:dark]"
              />
            </div>
            {(customFrom || customTo) && (
              <button
                type="button"
                onClick={() => { setCustomFrom(''); setCustomTo(''); }}
                className="text-xs text-theme-muted hover:text-white transition-colors underline underline-offset-2"
              >
                Clear dates
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <p className="text-theme-muted text-sm">Loading sessions…</p>
      ) : error ? (
        <p className="text-danger text-sm">{error}</p>
      ) : (
        <>
          <p className="text-xs text-theme-muted mb-3">
            {filteredRows.length} session{filteredRows.length !== 1 ? 's' : ''}
          </p>
          <DataTable
            columns={[
              { key: 'date', header: 'Date & Time' },
              {
                key: 'worker',
                header: 'Worker',
                render: (r) => (
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{r.worker as string}</p>
                    <p className="text-xs text-theme-muted truncate">{r.email as string}</p>
                  </div>
                ),
              },
              { key: 'machine', header: 'Machine / Platform' },
              { key: 'duration', header: 'Duration' },
              { key: 'type', header: 'Type' },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <StatusBadge status={r.status as string} />,
              },
              {
                key: 'id',
                header: '',
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => handleEyeClick(r.id as string)}
                    disabled={loadingSessionId === r.id}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors disabled:opacity-50"
                    style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}
                    title="View session details & images"
                  >
                    {loadingSessionId === r.id ? (
                      <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin block" />
                    ) : (
                      <Eye size={14} />
                    )}
                  </button>
                ),
              },
            ]}
            data={filteredRows as unknown as Record<string, unknown>[]}
            emptyMessage="No sessions match the current filters."
          />
        </>
      )}

      <SessionDetailPanel
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        onImageUploaded={handleImageUploaded}
        workerLabel={workerLabel}
      />
    </div>
  );
}
