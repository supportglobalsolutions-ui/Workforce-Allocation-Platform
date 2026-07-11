'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, Download, Eye, Users, X } from 'lucide-react';

import DataTable from '@/components/platform/DataTable';
import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import SessionDetailPanel from '@/components/rdp/SessionDetailPanel';
import { api } from '@/lib/api';

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
  username: string | null;
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

// ── Worker combobox ────────────────────────────────────────────────────────────

function workerPrimary(w: Worker): string {
  return w.username ? `@${w.username}` : w.display_name;
}
function workerSecondary(w: Worker): string {
  return w.email ?? '';
}

function WorkerCombobox({
  workers,
  selectedId,
  onSelect,
}: {
  workers: Worker[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = selectedId ? workers.find((w) => w.id === selectedId) ?? null : null;

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return workers;
    return workers.filter(
      (w) =>
        (w.username ?? '').toLowerCase().includes(q) ||
        w.display_name.toLowerCase().includes(q) ||
        (w.email ?? '').toLowerCase().includes(q),
    );
  }, [workers, query]);

  // close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function openCombo() {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function pick(id: string) {
    onSelect(id);
    setOpen(false);
    setQuery('');
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect(null);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={selected ? undefined : openCombo}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors border min-w-[220px] text-left ${
          selected
            ? 'bg-emerald-accent/10 border-emerald-accent/40 text-white'
            : 'bg-brand-surface-container/60 border-white/10 text-theme-muted hover:border-white/20 hover:text-white'
        }`}
      >
        <Users size={14} className={selected ? 'text-emerald-accent shrink-0' : 'shrink-0'} />
        <span className="flex-1 truncate font-medium">
          {selected ? workerPrimary(selected) : 'All workers'}
        </span>
        {selected ? (
          <X size={13} className="shrink-0 text-theme-muted hover:text-white" onClick={clear} />
        ) : (
          <ChevronDown size={13} className="shrink-0" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-40 w-80 rounded-xl border border-white/10 shadow-2xl overflow-hidden"
          style={{ background: 'var(--surface-elevated, #1a1f2e)' }}
        >
          {/* Search input inside dropdown */}
          <div className="p-2 border-b border-white/[0.06]">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username, name, or email…"
              className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-sm text-white placeholder:text-theme-muted/60 focus:outline-none focus:border-emerald-accent/40 transition-colors"
            />
          </div>

          {/* Options */}
          <div className="max-h-60 overflow-y-auto py-1">
            {/* "All workers" option */}
            <button
              type="button"
              onClick={() => { onSelect(null); setOpen(false); setQuery(''); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.05] ${
                !selectedId ? 'text-emerald-400' : 'text-theme-muted'
              }`}
            >
              All workers
            </button>

            <div className="border-t border-white/[0.06] my-1" />

            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-theme-muted">No workers found</p>
            ) : (
              filtered.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => pick(w.id)}
                  className={`w-full text-left px-4 py-2.5 transition-colors hover:bg-white/[0.05] ${
                    selectedId === w.id ? 'bg-emerald-accent/10' : ''
                  }`}
                >
                  <p className={`text-sm font-medium ${selectedId === w.id ? 'text-emerald-400' : 'text-white'}`}>
                    {workerPrimary(w)}
                  </p>
                  {workerSecondary(w) && (
                    <p className="text-xs text-theme-muted">{workerSecondary(w)}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [rdpResources, setRdpResources] = useState<RDPResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
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
      const machine = s.rdp_resource_id
        ? (rdpMap[s.rdp_resource_id]?.nickname ?? s.rdp_resource_id.slice(0, 8) + '…')
        : '—';
      return {
        id: s.id,
        date: new Date(s.start_time).toLocaleString(),
        start_time: s.start_time,
        session_type: s.session_type,
        worker: worker?.display_name ?? '—',
        email: worker?.email ?? '—',
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
    const statusVal = statusFilter ? (STATUS_VALUES[statusFilter] ?? statusFilter) : '';
    const typeVal = typeFilter
      ? (Object.entries(TYPE_LABELS).find(([, v]) => v === typeFilter)?.[0] ?? '')
      : '';

    return allRows.filter((r) => {
      if (selectedWorkerId && sessions.find((s) => s.id === r.id)?.worker_id !== selectedWorkerId) return false;
      if (statusVal && r.status !== statusVal) return false;
      if (typeVal && r.session_type !== typeVal) return false;
      if (!passesDateFilter(r.start_time, dateRange, customFrom, customTo)) return false;
      return true;
    });
  }, [allRows, sessions, selectedWorkerId, dateRange, customFrom, customTo, statusFilter, typeFilter]);

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

  const selectedWorkerObj = selectedWorkerId ? workerMap[selectedWorkerId] : null;
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
        {/* Row 1: worker combobox + status + type */}
        <div className="flex flex-wrap gap-3 items-center">
          <WorkerCombobox
            workers={workers}
            selectedId={selectedWorkerId}
            onSelect={setSelectedWorkerId}
          />

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
            {selectedWorkerObj && (
              <span className="ml-2 text-emerald-400">
                · {workerPrimary(selectedWorkerObj)}
              </span>
            )}
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
