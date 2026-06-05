'use client';

import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import { Zap, Clock, Server, TrendingUp } from 'lucide-react';

export default function UtilizationDashboardPage() {
  const machines = [
    { name: 'Nairobi Alpha', active: 72, idle: 18, offline: 10 },
    { name: 'Lagos Prime', active: 65, idle: 25, offline: 10 },
    { name: 'Kampala Core', active: 58, idle: 22, offline: 20 },
    { name: 'Accra Delta', active: 81, idle: 12, offline: 7 },
  ];

  return (
    <div>
      <PageHeader
        title="Utilization Dashboard"
        description="RDP machine utilization, idle time, availability, and capacity forecasting."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Avg Utilization" value="69%" icon={Zap} />
        <KpiCard label="Active Time" value="4,210h" icon={Clock} />
        <KpiCard label="Idle Time" value="1,890h" icon={Server} accent="gold" />
        <KpiCard label="Availability" value="91.2%" icon={TrendingUp} />
      </div>
      <div className="space-y-4">
        {machines.map((m) => (
          <div key={m.name} className="glass-panel p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-white">{m.name}</p>
              <p className="text-sm font-mono text-emerald-accent">{m.active}% utilized</p>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden">
              <div className="bg-emerald-accent" style={{ width: `${m.active}%` }} />
              <div className="bg-warning/60" style={{ width: `${m.idle}%` }} />
              <div className="bg-white/10" style={{ width: `${m.offline}%` }} />
            </div>
            <div className="flex gap-4 mt-2 text-[10px] text-brand-on-surface-variant">
              <span><span className="text-emerald-accent">●</span> Active {m.active}%</span>
              <span><span className="text-warning">●</span> Idle {m.idle}%</span>
              <span><span className="text-white/30">●</span> Offline {m.offline}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="glass-panel p-6 mt-6">
        <h2 className="font-bold text-white mb-2">Capacity Forecast</h2>
        <p className="text-sm text-brand-on-surface-variant">Based on current utilization trends, 12 additional machines recommended for Q3 to maintain &lt;85% capacity threshold.</p>
      </div>
    </div>
  );
}
