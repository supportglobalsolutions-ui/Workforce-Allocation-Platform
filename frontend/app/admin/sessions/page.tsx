'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, Download, Eye, RefreshCw, Users, X } from 'lucide-react';

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
  image_start_at?: string | null;
  image_end_at?: string | null;
  evidence_complete?: boolean | null;
  type_specific_fields?: Record<string, unknown> | null;
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
  live: boolean;
  heartbeat: string | null;
  start_image_url: string | null;
  end_image_url: string | null;
  image_start_at?: string | null;
  image_end_at?: string | null;
  duration_minutes?: number | null;
  evidence_complete?: boolean | null;
}

const TYPE_LABELS: Record<string, string> = {
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

const STATUS_OPTIONS = ['Completed', 'Force Released', 'Abandoned', 'Timed Out'];
const STATUS_VALUES: Record<string, string> = {
  Completed: 'completed',
  'Force Released': 'force_released',
  Abandoned: 'abandoned',
  'Timed Out': 'timed_out',
};

type DateRange = 'Last 6 hours' | 'Last 7 days' | 'Last 30 days' | 'Custom' | '';
const DATE_RANGE_OPTIONS: Exclude<DateRange, ''>[] = [
  'Last 6 hours',
  'Last 7 days',
  'Last 30 days',
  'Custom',
];

/** Which slice of the log the table is showing. */
type SessionView = 'all' | 'live' | 'history';

// Live rows tick their elapsed time and get refetched on this cadence.
const LIVE_REFRESH_MS = 30_000;

function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Open sessions have no duration yet, so it is derived from the clock. */
function formatElapsed(startTime: string, now: number): string {
  const elapsed = Math.max(0, Math.floor((now - new Date(startTime).getTime()) / 60_000));
  return `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`;
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<SessionView>('all');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);

  // Deep links from elsewhere in the app can preselect the live view.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v === 'live' || v === 'history' || v === 'all') setView(v);
  }, []);

  async function load(opts: { silent?: boolean } = {}) {
    if (opts.silent) setRefreshing(true); else setLoading(true);
    try {
      const [sessionRes, workerRes, rdpRes] = await Promise.allSettled([
        api.get<WorkSession[]>('/sessions?limit=500&include_images=false'),
        api.get<Worker[]>('/workers'),
        api.get<RDPResource[]>('/rdp'),
      ]);
      if (sessionRes.status === 'rejected') throw sessionRes.reason;
      setSessions(sessionRes.value);
      if (workerRes.status === 'fulfilled') setWorkers(workerRes.value);
      if (rdpRes.status === 'fulfilled') setRdpResources(rdpRes.value);
      setNow(Date.now());
      setError(null);
    } catch (e) {
      // A live poll must not replace a good table with a red banner for a
      // one-off proxy blip while the API reloads.
      if (!opts.silent) {
        setError(e instanceof Error ? e.message : 'Failed to load sessions');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Keep open sessions honest: refetch and re-tick elapsed while they are visible.
  const showingLive = view !== 'history';
  useEffect(() => {
    if (!showingLive) return;
    const t = setInterval(() => { void load({ silent: true }); }, LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [showingLive]);

  const workerMap = useMemo(
    () => Object.fromEntries(workers.map((w) => [w.id, w])),
    [workers],
  );
  const rdpMap = useMemo(
    () => Object.fromEntries(rdpResources.map((r) => [r.id, r])),
    [rdpResources],
  );

  const allRows = useMemo<SessionRow[]>(() => {
    return [...sessions]
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      .map((s) => {
        const worker = workerMap[s.worker_id];
        const machine = s.rdp_resource_id
          ? (rdpMap[s.rdp_resource_id]?.nickname ?? s.rdp_resource_id.slice(0, 8) + '…')
          : '—';
        const live = !s.end_time;
        return {
          id: s.id,
          date: new Date(s.start_time).toLocaleString(),
          start_time: s.start_time,
          session_type: s.session_type,
          worker: worker?.display_name ?? '—',
          email: worker?.email ?? '—',
          machine,
          duration: live ? formatElapsed(s.start_time, now) : formatDuration(s.duration_minutes),
          type: TYPE_LABELS[s.session_type] ?? s.session_type,
          status: s.close_status ?? (live ? 'active' : 'completed'),
          live,
          heartbeat: live
            ? (s.type_specific_fields?.last_heartbeat_at ? 'active' : 'idle')
            : null,
          start_image_url: s.start_image_url,
          end_image_url: s.end_image_url,
          image_start_at: s.image_start_at,
          image_end_at: s.image_end_at,
          duration_minutes: s.duration_minutes,
          evidence_complete: s.evidence_complete,
        };
      });
  }, [sessions, workerMap, rdpMap, now]);

  const liveCount = useMemo(() => allRows.filter((r) => r.live).length, [allRows]);

  const filteredRows = useMemo(() => {
    const statusVal = statusFilter ? (STATUS_VALUES[statusFilter] ?? statusFilter) : '';
    const typeVal = typeFilter
      ? (Object.entries(TYPE_LABELS).find(([, v]) => v === typeFilter)?.[0] ?? '')
      : '';
    const byId = Object.fromEntries(sessions.map((s) => [s.id, s]));

    return allRows.filter((r) => {
      if (view === 'live' && !r.live) return false;
      if (view === 'history' && r.live) return false;
      if (selectedWorkerId && byId[r.id]?.worker_id !== selectedWorkerId) return false;
      if (statusVal && r.status !== statusVal) return false;
      if (typeVal && r.session_type !== typeVal) return false;
      if (!passesDateFilter(r.start_time, dateRange, customFrom, customTo)) return false;
      return true;
    });
  }, [allRows, sessions, view, selectedWorkerId, dateRange, customFrom, customTo, statusFilter, typeFilter]);

  const handleEyeClick = (rowId: string) => {
    const row = filteredRows.find((r) => r.id === rowId);
    if (!row) return;
    setSelectedSession(row);
    void api.get<WorkSession>(`/sessions/${rowId}`).then((full) => {
      setSelectedSession((prev) =>
        prev?.id === rowId
          ? {
              ...prev,
              start_image_url: full.start_image_url,
              end_image_url: full.end_image_url,
              image_start_at: full.image_start_at,
              image_end_at: full.image_end_at,
              duration_minutes: full.duration_minutes,
              evidence_complete: full.evidence_complete,
              duration: full.end_time
                ? formatDuration(full.duration_minutes)
                : prev.duration,
            }
          : prev,
      );
    }).catch(() => {
      /* keep the row we already opened */
    });
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
    const headers = ['Date', 'Worker', 'Email', 'RDP / Platform', 'Duration', 'Type', 'Status'];
    const csvRows = filteredRows.map((r) =>
      [r.date, r.worker, r.email, r.machine, r.duration, r.type, r.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sessions-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const selectedWorkerObj = selectedWorkerId ? workerMap[selectedWorkerId] : null;
  const workerLabel = selectedSession
    ? `${selectedSession.worker}${selectedSession.email !== '—' ? ` • ${selectedSession.email}` : ''}`
    : undefined;

  const VIEWS: { key: SessionView; label: string; count?: number }[] = [
    { key: 'all', label: 'All sessions' },
    { key: 'live', label: 'Live', count: liveCount },
    { key: 'history', label: 'History' },
  ];

  return (
    <div>
      <PageHeader
        title="Sessions"
        description="Every work session in time order — live now and completed history, with the RDP machine used."
        actions={
          <div className="flex items-center gap-2">
            {liveCount > 0 && (
              <span className="flex items-center gap-2 text-xs font-mono text-emerald-accent mr-1">
                <span className="w-2 h-2 rounded-full bg-emerald-accent animate-pulse" />
                {liveCount} active
              </span>
            )}
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => void load({ silent: true })}
              disabled={refreshing}
              title="Refresh sessions"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button className="btn-secondary flex items-center gap-2" onClick={handleExportCsv}>
              <Download size={16} />
              Export CSV
            </button>
          </div>
        }
      />

      {/* ── Live / History switch ── */}
      <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 w-fit mb-5">
        {VIEWS.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              view === key ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-theme-heading'
            }`}
          >
            {key === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-accent animate-pulse" />}
            {label}
            {count != null && count > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-accent/20 text-emerald-400 text-[10px] tabular-nums">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

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
            disabled={view === 'live'}
            title={view === 'live' ? 'Live sessions have no close status yet' : undefined}
            className="px-4 py-2.5 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40 disabled:opacity-40"
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
            {showingLive && (
              <span className="ml-2">· live rows refresh every {LIVE_REFRESH_MS / 1000}s</span>
            )}
          </p>
          <DataTable
            columns={[
              {
                key: 'date',
                header: 'Date & Time',
                render: (r) => (
                  <span className="flex items-center gap-2">
                    {(r.live as boolean) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-accent animate-pulse shrink-0" title="In progress" />
                    )}
                    {r.date as string}
                  </span>
                ),
              },
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
              { key: 'machine', header: 'RDP / Platform' },
              {
                key: 'duration',
                header: 'Duration',
                render: (r) => (
                  <span className={(r.live as boolean) ? 'text-emerald-accent font-semibold tabular-nums' : 'tabular-nums'}>
                    {r.duration as string}
                    {(r.live as boolean) && <span className="text-[10px] text-theme-muted ml-1">elapsed</span>}
                  </span>
                ),
              },
              { key: 'type', header: 'Type' },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={r.status as string} />
                    {r.heartbeat ? (
                      <StatusBadge
                        status={r.heartbeat === 'active' ? 'approved' : 'idle'}
                        label={`HB: ${r.heartbeat as string}`}
                      />
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'id',
                header: '',
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => handleEyeClick(r.id as string)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                    style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}
                    title="View session details & images"
                  >
                    <Eye size={14} />
                  </button>
                ),
              },
            ]}
            data={filteredRows as unknown as Record<string, unknown>[]}
            emptyMessage={
              view === 'live'
                ? 'No active sessions right now.'
                : 'No sessions match the current filters.'
            }
          />
        </>
      )}

      <SessionDetailPanel
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        onImageUploaded={handleImageUploaded}
        workerLabel={workerLabel}
        allowUpload={false}
        allowEvidenceEdit={false}
      />
    </div>
  );
}
