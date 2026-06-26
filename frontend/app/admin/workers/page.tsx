'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';

interface Worker {
  id: string;
  display_name: string;
  country: string;
  worker_type: string;
  partner_entity_id: string | null;
  status: string;
}

const TYPE_LABELS: Record<string, string> = {
  gs_registered: 'GS Registered',
  partner_worker: 'Partner Worker',
};

export default function WorkerManagementPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Worker[]>('/workers')
      .then(setWorkers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load workers'))
      .finally(() => setLoading(false));
  }, []);

  const rows = workers.map((w) => ({
    id: w.id,
    name: w.display_name,
    country: w.country,
    type: TYPE_LABELS[w.worker_type] ?? w.worker_type,
    partner: w.partner_entity_id ? `${w.partner_entity_id.slice(0, 8)}…` : '—',
    status: w.status,
  }));

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
      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading workers...</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : (
        <DataTable
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'country', header: 'Country' },
            { key: 'type', header: 'Type' },
            { key: 'partner', header: 'Partner' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status === 'active' ? 'approved' : 'offline'} label={r.status as string} /> },
            { key: 'actions', header: '', render: () => (
              <div className="flex gap-2">
                <button className="text-xs text-emerald-accent hover:underline">Edit</button>
                <button className="text-xs text-danger hover:underline">Deactivate</button>
              </div>
            )},
          ]}
          data={rows as Record<string, unknown>[]}
          emptyMessage="No workers yet."
        />
      )}
    </div>
  );
}
