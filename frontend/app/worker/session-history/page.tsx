'use client';

import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import { Download } from 'lucide-react';
import { sessions } from '@/lib/mock-data';

export default function SessionHistoryPage() {
  return (
    <div>
      <PageHeader
        title="Session History"
        description="Complete log of your sessions across GS RDP, partner multilog, and third-party platforms."
        actions={<button className="btn-secondary flex items-center gap-2"><Download size={16} />Export CSV</button>}
      />
      <FilterBar
        searchPlaceholder="Search sessions..."
        filters={[
          { label: 'Status', options: ['Completed', 'Force Released', 'Abandoned'] },
          { label: 'Type', options: ['GS RDP', 'Partner Multilog', 'Prolific', 'Outlier', 'Handshake'] },
          { label: 'Date Range', options: ['Last 7 days', 'Last 30 days', 'This period'] },
        ]}
      />
      <DataTable
        columns={[
          { key: 'date', header: 'Date' },
          { key: 'machine', header: 'Machine / Platform' },
          { key: 'duration', header: 'Duration' },
          { key: 'type', header: 'Type' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status as string} /> },
        ]}
        data={sessions as Record<string, unknown>[]}
      />
    </div>
  );
}
