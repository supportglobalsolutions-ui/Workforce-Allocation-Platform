'use client';

import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import { Users, Activity, DollarSign, Server, TrendingUp, AlertTriangle } from 'lucide-react';
import { kpis, auditLogs } from '@/lib/mock-data';

export default function AdminDashboard() {
  return (
    <div>
      <PageHeader
        title="Admin Command Center"
        description="Operations overview — workers, active sessions, payroll status, system health, and live activity."
      />
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <KpiCard label="Workers Online" value={kpis.workersOnline} icon={Users} />
        <KpiCard label="Active Sessions" value={kpis.activeSessions} icon={Activity} accent="blue" />
        <KpiCard label="Payroll Pending" value={kpis.payrollPending} icon={DollarSign} accent="gold" />
        <KpiCard label="Machines Online" value={kpis.machinesOnline} icon={Server} />
        <KpiCard label="Quality Index" value={`${kpis.qualityIndex}%`} icon={TrendingUp} />
        <KpiCard label="Exceptions" value={3} icon={AlertTriangle} accent="danger" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h2 className="text-sm font-bold text-white mb-4">Session Trends</h2>
          <div className="h-40 flex items-end gap-2">
            {[65, 78, 82, 71, 87, 92, 85].map((v, i) => (
              <div key={i} className="flex-1 bg-emerald-accent/20 rounded-t-lg relative" style={{ height: `${v}%` }}>
                <div className="absolute inset-x-0 bottom-0 bg-emerald-accent/60 rounded-t-lg" style={{ height: '100%' }} />
              </div>
            ))}
          </div>
          <p className="text-xs text-brand-on-surface-variant mt-3">Sessions completed — last 7 days</p>
        </div>
        <div className="glass-panel p-6">
          <h2 className="text-sm font-bold text-white mb-4">Country Performance</h2>
          {['Kenya', 'Nigeria', 'Uganda', 'Ghana'].map((c, i) => (
            <div key={c} className="flex items-center gap-3 mb-3">
              <span className="text-xs text-white w-16">{c}</span>
              <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-accent rounded-full" style={{ width: `${[92, 78, 85, 71][i]}%` }} />
              </div>
              <span className="text-xs font-mono text-emerald-accent">{[92, 78, 85, 71][i]}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="glass-panel p-6 mt-6">
        <h2 className="text-sm font-bold text-white mb-4">Live Activity Feed</h2>
        <div className="space-y-2">
          {auditLogs.map((log, i) => (
            <div key={i} className="flex flex-wrap gap-2 text-sm py-2 border-b border-white/[0.03] last:border-0">
              <span className="text-brand-on-surface-variant font-mono text-xs">{log.timestamp}</span>
              <span className="text-white font-medium">{log.actor}</span>
              <span className="text-emerald-accent">{log.action}</span>
              <span className="text-brand-on-surface-variant">on {log.entity}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
