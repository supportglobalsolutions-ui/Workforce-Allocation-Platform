'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { SYSTEM_TABS } from '@/components/platform/AdminSectionTabs';
import DataAlert from '@/components/platform/DataAlert';
import DataTable from '@/components/platform/DataTable';
import { api } from '@/lib/api';

interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  previous_value: unknown;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

type RdpAccessFilter = 'all' | 'login' | 'logout';

function rdpAccessLabel(action: string): string {
  if (action === 'rdp.logged_in') return 'Logged in';
  if (action === 'rdp.logged_out') return 'Logged out';
  return action;
}

function formatAccessRow(log: AuditLog) {
  const payload = log.new_value ?? {};
  return {
    timestamp: new Date(log.created_at).toLocaleString(),
    worker: typeof payload.worker_name === 'string' ? payload.worker_name : '—',
    action: rdpAccessLabel(log.action),
    machine: typeof payload.rdp_nickname === 'string' ? payload.rdp_nickname : '—',
    ip: log.ip_address ?? '—',
    initiatedBy: typeof payload.initiated_by === 'string' ? payload.initiated_by : 'worker',
  };
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RdpAccessFilter>('all');

  useEffect(() => {
    api.get<AuditLog[]>('/audit?limit=500')
      .then(setLogs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load audit logs'))
      .finally(() => setLoading(false));
  }, []);

  const rdpLogs = useMemo(
    () => logs.filter((log) => log.action === 'rdp.logged_in' || log.action === 'rdp.logged_out'),
    [logs],
  );

  const visibleLogs = useMemo(() => {
    if (filter === 'login') return rdpLogs.filter((log) => log.action === 'rdp.logged_in');
    if (filter === 'logout') return rdpLogs.filter((log) => log.action === 'rdp.logged_out');
    return rdpLogs;
  }, [filter, rdpLogs]);

  const rows = visibleLogs.map(formatAccessRow);

  return (
    <div>
      <PageHeader title="RDP Access Audit" />
      <AdminSectionTabs tabs={SYSTEM_TABS} />

      <p className="text-sm text-theme-muted mb-4 max-w-3xl">
        Immutable record of who connected to or disconnected from each RDP machine, with timestamp and IP address.
        Entries cannot be edited or deleted.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {([
          ['all', 'All access'],
          ['login', 'Logins'],
          ['logout', 'Logouts'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-colors ${
              filter === value
                ? 'border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent'
                : 'border-theme bg-brand-surface-low text-theme-muted hover:text-theme-heading'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading audit logs...</p>
      ) : error ? (
        <DataAlert tone="error">{error}</DataAlert>
      ) : rows.length === 0 ? (
        <DataAlert>No RDP login or logout events recorded yet.</DataAlert>
      ) : (
        <DataTable
          columns={[
            { key: 'timestamp', header: 'When' },
            { key: 'worker', header: 'Worker' },
            {
              key: 'action',
              header: 'Event',
              render: (r) => (
                <span className={`font-mono text-xs font-bold ${
                  r.action === 'Logged in' ? 'text-emerald-accent' : 'text-gold-accent'
                }`}>
                  {r.action as string}
                </span>
              ),
            },
            { key: 'machine', header: 'RDP machine' },
            { key: 'ip', header: 'IP address' },
            { key: 'initiatedBy', header: 'Initiated by' },
          ]}
          data={rows as Record<string, unknown>[]}
          emptyMessage="No matching RDP access events."
        />
      )}
    </div>
  );
}
