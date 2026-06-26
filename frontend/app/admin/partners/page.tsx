'use client';

import PageHeader from '@/components/platform/PageHeader';
import DataTable from '@/components/platform/DataTable';
import { Plus } from 'lucide-react';

export default function PartnerManagementPage() {
  return (
    <div>
      <PageHeader
        title="Partner Management"
        description="Manage partner entities, default split percentages, client overrides, and revenue breakdown."
        actions={<button className="btn-primary flex items-center gap-2"><Plus size={16} />Add Partner</button>}
      />
      <div className="glass-panel p-8 text-center text-brand-on-surface-variant text-sm mb-8">
        No partner entities configured yet. Add a partner to manage revenue splits.
      </div>
      <DataTable
        columns={[
          { key: 'name', header: 'Partner' },
          { key: 'workerPct', header: 'Worker %' },
          { key: 'gsPct', header: 'GS %' },
          { key: 'partnerPct', header: 'Partner %' },
          { key: 'workers', header: 'Workers' },
          { key: 'revenue', header: 'Revenue' },
        ]}
        data={[]}
        emptyMessage="No partners yet."
      />
    </div>
  );
}
