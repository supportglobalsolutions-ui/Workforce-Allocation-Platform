'use client';

import PageHeader from '@/components/platform/PageHeader';
import DataTable from '@/components/platform/DataTable';
import { Plus } from 'lucide-react';
import { partners } from '@/lib/mock-data';

export default function PartnerManagementPage() {
  return (
    <div>
      <PageHeader
        title="Partner Management"
        description="Manage partner entities, default split percentages, client overrides, and revenue breakdown."
        actions={<button className="btn-primary flex items-center gap-2"><Plus size={16} />Add Partner</button>}
      />
      <div className="grid lg:grid-cols-3 gap-4 mb-8">
        {partners.map((p) => (
          <div key={p.id} className="glass-panel p-5">
            <h3 className="font-bold text-white mb-3">{p.name}</h3>
            <div className="grid grid-cols-3 gap-2 text-center mb-4">
              <div><p className="text-[10px] text-brand-on-surface-variant">Worker</p><p className="text-emerald-accent font-bold">{p.workerPct}%</p></div>
              <div><p className="text-[10px] text-brand-on-surface-variant">GS</p><p className="text-gold-accent font-bold">{p.gsPct}%</p></div>
              <div><p className="text-[10px] text-brand-on-surface-variant">Partner</p><p className="text-white font-bold">{p.partnerPct}%</p></div>
            </div>
            <p className="text-xs text-brand-on-surface-variant">{p.workers} workers · £{p.revenue.toLocaleString()} revenue</p>
            <button className="btn-secondary w-full mt-3 text-xs">View Overrides</button>
          </div>
        ))}
      </div>
      <DataTable
        columns={[
          { key: 'name', header: 'Partner' },
          { key: 'workerPct', header: 'Worker %', render: (r) => `${r.workerPct}%` },
          { key: 'gsPct', header: 'GS %', render: (r) => `${r.gsPct}%` },
          { key: 'partnerPct', header: 'Partner %', render: (r) => `${r.partnerPct}%` },
          { key: 'workers', header: 'Workers' },
          { key: 'revenue', header: 'Revenue', render: (r) => `£${(r.revenue as number).toLocaleString()}` },
        ]}
        data={partners as Record<string, unknown>[]}
      />
    </div>
  );
}
