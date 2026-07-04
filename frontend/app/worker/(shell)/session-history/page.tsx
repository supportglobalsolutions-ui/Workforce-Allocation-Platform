'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

import DataTable from '@/components/platform/DataTable';
import FilterBar from '@/components/platform/FilterBar';
import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';

interface WorkSession {
  id: string;
  session_type: string;
  start_time: string;
  duration_minutes: number | null;
  close_status: string | null;
  rdp_resource_id: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

function formatDuration(minutes: number | null): string {
  if (!minutes) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function SessionHistoryPage() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<WorkSession[]>('/sessions?limit=200')
      .then(setSessions)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load sessions'))
      .finally(() => setLoading(false));
  }, []);

  const rows = sessions.map((s) => ({
    id: s.id,
    date: new Date(s.start_time).toLocaleString(),
    machine: s.rdp_resource_id ? `RDP ${s.rdp_resource_id.slice(0, 8)}…` : '—',
    duration: formatDuration(s.duration_minutes),
    type: TYPE_LABELS[s.session_type] ?? s.session_type,
    status: s.close_status ?? 'pending',
  }));

  return (
    <div>
      <PageHeader
        title="Session History"
        description="Complete log of your sessions across GS RDP, partner multilog, and third-party platforms."
        actions={
          <button className="btn-secondary flex items-center gap-2">
            <Download size={16} />
            Export CSV
          </button>
        }
      />
      <FilterBar
        searchPlaceholder="Search sessions..."
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
          ]}
          data={rows as Record<string, unknown>[]}
          emptyMessage="No sessions found."
        />
      )}
    </div>
  );
}
