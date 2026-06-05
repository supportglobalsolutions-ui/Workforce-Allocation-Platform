'use client';

import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import DataTable from '@/components/platform/DataTable';
import { auditLogs } from '@/lib/mock-data';

export default function AuditLogsPage() {
  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Append-only audit trail — every material action with actor, entity, timestamp, and value changes."
      />
      <FilterBar
        searchPlaceholder="Search audit logs..."
        filters={[
          { label: 'Action', options: ['CLAIM', 'FORCE_RELEASE', 'QUALITY_RATING', 'PAYROLL_APPROVE'] },
          { label: 'Actor', options: ['Admin Lead', 'Workers'] },
        ]}
      />
      <DataTable
        columns={[
          { key: 'timestamp', header: 'Timestamp' },
          { key: 'actor', header: 'Actor' },
          { key: 'action', header: 'Action', render: (r) => <span className="text-emerald-accent font-mono text-xs">{r.action as string}</span> },
          { key: 'entity', header: 'Entity' },
          { key: 'old', header: 'Old Value' },
          { key: 'new', header: 'New Value' },
        ]}
        data={auditLogs as Record<string, unknown>[]}
      />
    </div>
  );
}
