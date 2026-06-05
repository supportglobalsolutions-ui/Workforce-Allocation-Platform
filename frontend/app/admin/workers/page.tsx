'use client';

import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import { Plus } from 'lucide-react';
import { workers } from '@/lib/mock-data';

export default function WorkerManagementPage() {
  return (
    <div>
      <PageHeader
        title="Worker Management"
        description="Create, edit, and deactivate worker profiles. Assign roles and partner organisations."
        actions={<button className="btn-primary flex items-center gap-2"><Plus size={16} />Create Worker</button>}
      />
      <FilterBar
        searchPlaceholder="Search workers..."
        filters={[
          { label: 'Type', options: ['GS Registered', 'Partner Worker'] },
          { label: 'Country', options: ['Kenya', 'Nigeria', 'Uganda', 'Ghana'] },
          { label: 'Status', options: ['Active', 'Inactive'] },
        ]}
      />
      <DataTable
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'country', header: 'Country' },
          { key: 'type', header: 'Type' },
          { key: 'partner', header: 'Partner' },
          { key: 'quality', header: 'Quality', render: (r) => <span className="text-emerald-accent font-mono">{r.quality as number}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status === 'active' ? 'approved' : 'offline'} label={r.status as string} /> },
          { key: 'actions', header: '', render: () => (
            <div className="flex gap-2">
              <button className="text-xs text-emerald-accent hover:underline">Edit</button>
              <button className="text-xs text-danger hover:underline">Deactivate</button>
            </div>
          )},
        ]}
        data={workers as Record<string, unknown>[]}
      />
    </div>
  );
}
