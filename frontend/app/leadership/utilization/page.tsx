'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import { Zap, Clock, Server, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';

interface RDPResource {
  id: string;
  nickname: string;
  status: string;
}

const ONLINE_STATUSES = new Set(['online_free', 'assigned', 'active', 'idle']);

export default function UtilizationDashboardPage() {
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<RDPResource[]>('/rdp')
      .then(setMachines)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load machines'))
      .finally(() => setLoading(false));
  }, []);

  const onlineCount = machines.filter((m) => ONLINE_STATUSES.has(m.status)).length;
  const activeCount = machines.filter((m) => m.status === 'active').length;
  const idleCount = machines.filter((m) => m.status === 'idle' || m.status === 'online_free').length;
  const offlineCount = machines.length - onlineCount;

  const avgUtil = machines.length > 0 ? Math.round((activeCount / machines.length) * 100) : 0;
  const availability = machines.length > 0 ? Math.round((onlineCount / machines.length) * 1000) / 10 : 0;

  return (
    <div>
      <PageHeader
        title="Utilization Dashboard"
        description="RDP machine utilization, idle time, availability, and capacity forecasting."
      />
      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading utilization...</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KpiCard label="Avg Utilization" value={machines.length > 0 ? `${avgUtil}%` : '—'} icon={Zap} />
            <KpiCard label="Active Machines" value={activeCount} icon={Clock} />
            <KpiCard label="Idle / Free" value={idleCount} icon={Server} accent="gold" />
            <KpiCard label="Availability" value={machines.length > 0 ? `${availability}%` : '—'} icon={TrendingUp} />
          </div>
          {machines.length === 0 ? (
            <p className="text-theme-muted text-sm">No RDP resources configured yet.</p>
          ) : (
            <div className="space-y-4">
              {machines.map((m) => {
                const active = m.status === 'active' ? 100 : m.status === 'idle' ? 40 : m.status === 'online_free' ? 0 : 0;
                const idle = m.status === 'idle' ? 60 : m.status === 'online_free' ? 100 : 0;
                const offline = ONLINE_STATUSES.has(m.status) ? 0 : 100;
                return (
                  <div key={m.id} className="glass-panel p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-bold text-white">{m.nickname}</p>
                      <p className="text-sm font-mono text-emerald-accent capitalize">{m.status.replace('_', ' ')}</p>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden">
                      <div className="bg-emerald-accent" style={{ width: `${active}%` }} />
                      <div className="bg-warning/60" style={{ width: `${idle}%` }} />
                      <div className="bg-white/10" style={{ width: `${offline}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="glass-panel p-6 mt-6">
            <h2 className="font-bold text-white mb-2">Capacity Forecast</h2>
            <p className="text-sm text-brand-on-surface-variant">
              {machines.length === 0
                ? 'Add RDP resources to enable capacity forecasting.'
                : `${offlineCount} machine(s) offline. Forecasting requires historical utilization data.`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
