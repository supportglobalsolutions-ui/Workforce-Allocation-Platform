'use client';

import { useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import StatusBadge from '@/components/platform/StatusBadge';
import { machines } from '@/lib/mock-data';

export default function RdpClaimBoard() {
  const [claimed, setClaimed] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="RDP Claim Board"
        description="Real-time machine grid — claim available GlobalSolutions RDP resources. Status updates driven by Firebase."
        actions={<span className="flex items-center gap-2 text-xs font-mono text-emerald-accent"><span className="w-2 h-2 rounded-full bg-emerald-accent animate-pulse" />Live</span>}
      />
      <FilterBar
        searchPlaceholder="Search machines..."
        filters={[
          { label: 'Country', options: ['Kenya', 'Nigeria', 'Uganda', 'Ghana'] },
          { label: 'Client', options: ['Client A', 'Client B', 'Client C', 'Client D'] },
          { label: 'Status', options: ['Online Free', 'Active', 'Idle', 'Maintenance'] },
        ]}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {machines.map((m) => (
          <div key={m.id} className="glass-panel p-5 hover:border-emerald-accent/20 transition-all">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-mono text-brand-on-surface-variant">{m.id}</p>
                <h3 className="text-base font-bold text-white">{m.name}</h3>
              </div>
              <StatusBadge status={m.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div><span className="text-brand-on-surface-variant">Country</span><p className="text-white font-medium">{m.country}</p></div>
              <div><span className="text-brand-on-surface-variant">Client</span><p className="text-white font-medium">{m.client}</p></div>
              <div><span className="text-brand-on-surface-variant">Health</span><p className={`font-mono font-bold ${m.health > 80 ? 'text-success' : m.health > 50 ? 'text-warning' : 'text-danger'}`}>{m.health}%</p></div>
              <div><span className="text-brand-on-surface-variant">User</span><p className="text-white font-medium">{m.user ?? '—'}</p></div>
            </div>
            {m.status === 'online_free' && (
              <button
                onClick={() => setClaimed(m.id)}
                className="btn-primary w-full"
              >
                {claimed === m.id ? 'Claimed ✓' : 'Claim Machine'}
              </button>
            )}
            {m.status === 'active' && <p className="text-xs text-center text-brand-on-surface-variant">In use</p>}
            {m.status === 'maintenance' && <p className="text-xs text-center text-gold-accent">Under maintenance</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
