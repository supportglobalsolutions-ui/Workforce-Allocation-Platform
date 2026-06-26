'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
  status: string;
  assigned_worker_id: string | null;
  health_notes: string | null;
}

export default function RdpManagementPage() {
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<RDPResource[]>('/rdp')
      .then(setMachines)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load machines'))
      .finally(() => setLoading(false));
  }, []);

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
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : machines.length === 0 ? (
        <div className="glass-panel p-8 text-center text-brand-on-surface-variant text-sm">
          No RDP machines configured yet. Add machines to manage status, maintenance, and force release.
        </div>
      ) : (
        <div className="space-y-3">
          {machines.map((m) => (
            <div key={m.id} className="glass-panel p-4 flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono text-xs text-brand-on-surface-variant">{m.id.slice(0, 8)}…</span>
                  <StatusBadge status={m.status} />
                </div>
                <p className="font-bold text-white">{m.nickname}</p>
                <p className="text-xs text-brand-on-surface-variant">
                  {m.country} · {m.client_group}
                  {m.health_notes ? ` · ${m.health_notes}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary text-xs py-1.5">Maintenance</button>
                <button className="btn-secondary text-xs py-1.5">Lock</button>
                <button className="btn-secondary text-xs py-1.5 border-danger/30 text-danger">Force Release</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
