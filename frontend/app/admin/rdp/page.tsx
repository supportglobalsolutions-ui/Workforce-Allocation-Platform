'use client';

import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import StatusBadge from '@/components/platform/StatusBadge';
import { machines } from '@/lib/mock-data';

export default function RdpManagementPage() {
  return (
    <div>
      <PageHeader
        title="RDP Resource Management"
        description="Control all machines — status, maintenance mode, lock, force release, and health monitoring."
      />
      <FilterBar
        searchPlaceholder="Search machines..."
        filters={[
          { label: 'Status', options: ['Online Free', 'Active', 'Maintenance', 'Locked'] },
          { label: 'Country', options: ['Kenya', 'Nigeria', 'Uganda', 'Ghana'] },
        ]}
      />
      <div className="space-y-3">
        {machines.map((m) => (
          <div key={m.id} className="glass-panel p-4 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <span className="font-mono text-xs text-brand-on-surface-variant">{m.id}</span>
                <StatusBadge status={m.status} />
              </div>
              <p className="font-bold text-white">{m.name}</p>
              <p className="text-xs text-brand-on-surface-variant">{m.country} · {m.client} · Health {m.health}%</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary text-xs py-1.5">Maintenance</button>
              <button className="btn-secondary text-xs py-1.5">Lock</button>
              <button className="btn-secondary text-xs py-1.5 border-danger/30 text-danger">Force Release</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
