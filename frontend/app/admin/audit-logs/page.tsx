'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { SYSTEM_TABS } from '@/components/platform/AdminSectionTabs';
import FilterBar from '@/components/platform/FilterBar';
import DataTable from '@/components/platform/DataTable';
import { api } from '@/lib/api';

interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  previous_value: unknown;
  new_value: unknown;
  created_at: string;
}

function formatValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AuditLog[]>('/audit?limit=200')
      .then(setLogs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load audit logs'))
      .finally(() => setLoading(false));
  }, []);

  const rows = logs.map((log) => ({
    timestamp: new Date(log.created_at).toLocaleString(),
    actor: log.actor_id ? `${log.actor_id.slice(0, 8)}…` : 'System',
    action: log.action,
    entity: `${log.target_type} ${log.target_id.slice(0, 8)}…`,
    old: formatValue(log.previous_value),
    new: formatValue(log.new_value),
  }));

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Append-only audit trail — every material action with actor, entity, timestamp, and value changes."
      />
      <AdminSectionTabs tabs={SYSTEM_TABS} />
      <FilterBar
        searchPlaceholder="Search audit logs..."
        filters={[
          { label: 'Action', options: ['CLAIM', 'FORCE_RELEASE', 'QUALITY_RATING', 'PAYROLL_APPROVE'] },
          { label: 'Actor', options: ['Admin Lead', 'Workers'] },
        ]}
      />
      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading audit logs...</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : (
        <DataTable
          columns={[
            { key: 'timestamp', header: 'Timestamp' },
            { key: 'actor', header: 'Actor' },
            { key: 'action', header: 'Action', render: (r) => <span className="text-emerald-accent font-mono text-xs">{r.action as string}</span> },
            { key: 'entity', header: 'Entity' },
            { key: 'old', header: 'Old Value' },
            { key: 'new', header: 'New Value' },
          ]}
          data={rows as Record<string, unknown>[]}
          emptyMessage="No audit log entries yet."
        />
      )}
    </div>
  );
}
