'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Eye } from 'lucide-react';

import DataTable from '@/components/platform/DataTable';
import FilterBar from '@/components/platform/FilterBar';
import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import SessionDetailPanel from '@/components/rdp/SessionDetailPanel';
import { api } from '@/lib/api';

interface WorkSession {
  id: string;
  session_type: string;
  start_time: string;
  duration_minutes: number | null;
  close_status: string | null;
  rdp_resource_id: string | null;
  start_image_url: string | null;
  end_image_url: string | null;
}

interface RDPResource {
  id: string;
  nickname: string;
}

const TYPE_LABELS: Record<string, string> = {
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

const TYPE_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(TYPE_LABELS).map(([k, v]) => [v, k]),
);

const STATUS_BY_LABEL: Record<string, string> = {
  Completed: 'completed',
  'Force Released': 'force_released',
  Abandoned: 'abandoned',
};

function formatDuration(minutes: number | null): string {
  if (!minutes) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function isInDateRange(startTime: string, range: string): boolean {
  if (!range) return true;
  const start = new Date(startTime);
  const now = new Date();
  if (range === 'Last 7 days') {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);
    return start >= cutoff;
  }
  if (range === 'Last 30 days') {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);
    return start >= cutoff;
  }
  if (range === 'This period') {
    const cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    return start >= cutoff;
  }
  return true;
}

export default function SessionHistoryPage() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<WorkSession[]>('/sessions?limit=200'),
      api.get<RDPResource[]>('/rdp'),
    ])
      .then(([sessionList, machineList]) => {
        setSessions(sessionList);
        setMachines(machineList);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load sessions'))
      .finally(() => setLoading(false));
  }, []);

  const machineName = (id: string | null) => {
    if (!id) return '—';
    return machines.find((m) => m.id === id)?.nickname ?? id.slice(0, 8) + '…';
  };

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const statusValue = statusFilter ? STATUS_BY_LABEL[statusFilter] : '';
    const typeValue = typeFilter ? TYPE_BY_LABEL[typeFilter] : '';

    return sessions.filter((s) => {
      if (statusValue && (s.close_status ?? 'pending') !== statusValue) return false;
      if (typeValue && s.session_type !== typeValue) return false;
      if (!isInDateRange(s.start_time, dateRangeFilter)) return false;

      if (!q) return true;
      const machine = machineName(s.rdp_resource_id).toLowerCase();
      const type = (TYPE_LABELS[s.session_type] ?? s.session_type).toLowerCase();
      const status = (s.close_status ?? 'pending').replace(/_/g, ' ');
      const date = new Date(s.start_time).toLocaleString().toLowerCase();
      return machine.includes(q) || type.includes(q) || status.includes(q) || date.includes(q);
    });
  }, [sessions, machines, search, statusFilter, typeFilter, dateRangeFilter]);

  const handleFilterChange = (label: string, value: string) => {
    if (label === 'Status') setStatusFilter(value);
    if (label === 'Type') setTypeFilter(value);
    if (label === 'Date Range') setDateRangeFilter(value);
  };

  const handleExportCsv = () => {
    const headers = ['Date & Time', 'Machine / Platform', 'Duration', 'Type', 'Status'];
    const csvRows = [
      headers.join(','),
      ...rows.map((r) =>
        [r.date, r.machine, r.duration, r.type, r.status]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImageUploaded = (sessionId: string, type: 'start' | 'end', url: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, [`${type}_image_url`]: url }
          : s,
      ),
    );
  };

  const rows = filteredSessions.map((s) => ({
    id: s.id,
    date: new Date(s.start_time).toLocaleString(),
    machine: machineName(s.rdp_resource_id),
    duration: formatDuration(s.duration_minutes),
    type: TYPE_LABELS[s.session_type] ?? s.session_type,
    status: s.close_status ?? 'pending',
    start_image_url: s.start_image_url,
    end_image_url: s.end_image_url,
  }));

  const selectedSession = selectedId
    ? rows.find((r) => r.id === selectedId) ?? null
    : null;

  return (
    <div>
      <PageHeader
        title="Session History"
        description="Complete log of your sessions across GS RDP, partner multilog, and third-party platforms."
        actions={
          <button className="btn-secondary flex items-center gap-2" onClick={handleExportCsv}>
            <Download size={16} />
            Export CSV
          </button>
        }
      />
      <FilterBar
        searchPlaceholder="Search sessions..."
        onSearch={setSearch}
        onFilterChange={handleFilterChange}
        filters={[
          { label: 'Status', options: ['Completed', 'Force Released', 'Abandoned'] },
          { label: 'Type', options: ['GS RDP', 'Partner Multilog', 'Third Party'] },
          { label: 'Date Range', options: ['Last 7 days', 'Last 30 days', 'This period'] },
        ]}
      />
      {loading ? (
        <p className="text-theme-muted text-sm">Loading sessions...</p>
      ) : error ? (
        <p className="text-danger text-sm">{error}</p>
      ) : (
        <DataTable
          columns={[
            { key: 'date', header: 'Date & Time' },
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
                  onClick={() => setSelectedId(r.id as string)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                  style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}
                  title="View session details & images"
                >
                  <Eye size={14} />
                </button>
              ),
            },
          ]}
          data={rows as Record<string, unknown>[]}
          emptyMessage="No sessions found."
        />
      )}

      <SessionDetailPanel
        session={selectedSession}
        onClose={() => setSelectedId(null)}
        onImageUploaded={handleImageUploaded}
      />
    </div>
  );
}
