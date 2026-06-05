'use client';

import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import { Users, Activity, DollarSign, Star, Globe2, Server } from 'lucide-react';
import { kpis, machines, partners, leaderboard, auditLogs } from '@/lib/mock-data';
import StatusBadge from '@/components/platform/StatusBadge';

export default function CeoCommandCenterPage() {
  return (
    <div>
      <PageHeader
        title="CEO Command Center"
        description="Executive command view — real-time organisation state across workers, sessions, revenue, and quality."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Workers Online" value={kpis.workersOnline} icon={Users} />
        <KpiCard label="Active Sessions" value={kpis.activeSessions} icon={Activity} accent="blue" />
        <KpiCard label="Revenue" value={`£${(kpis.revenue / 1000).toFixed(0)}K`} icon={DollarSign} accent="gold" />
        <KpiCard label="Quality Index" value={`${kpis.qualityIndex}%`} icon={Star} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="glass-panel p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4"><Globe2 size={18} className="text-emerald-accent" /><h2 className="font-bold text-white">World Activity Map</h2></div>
          <div className="h-48 rounded-xl bg-brand-primary-dark/50 border border-white/5 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, #3FC7A0 1px, transparent 1px), radial-gradient(circle at 70% 40%, #D4AF37 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            {['Kenya', 'Nigeria', 'Uganda', 'Ghana'].map((c, i) => (
              <div key={c} className="absolute text-xs font-mono text-emerald-accent" style={{ left: `${20 + i * 20}%`, top: `${30 + (i % 2) * 20}%` }}>
                ● {c}
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4"><Server size={18} className="text-emerald-accent" /><h2 className="font-bold text-white">Machine Status</h2></div>
          <div className="space-y-2">
            {machines.slice(0, 4).map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-white truncate">{m.name}</span>
                <StatusBadge status={m.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="glass-panel p-6">
          <h2 className="font-bold text-white mb-4">Partner Performance</h2>
          {partners.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
              <span className="text-sm text-white">{p.name}</span>
              <span className="text-sm font-mono text-gold-accent">£{p.revenue.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="glass-panel p-6">
          <h2 className="font-bold text-white mb-4">Top Workers</h2>
          {leaderboard.slice(0, 5).map((w) => (
            <div key={w.rank} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
              <span className="text-sm text-white">#{w.rank} {w.name}</span>
              <span className="text-sm font-mono text-emerald-accent">{w.score}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel p-6">
        <h2 className="font-bold text-white mb-4">Live Activity Feed</h2>
        {auditLogs.map((log, i) => (
          <div key={i} className="text-sm py-2 border-b border-white/[0.03] last:border-0 text-brand-on-surface-variant">
            <span className="font-mono text-xs">{log.timestamp}</span> — {log.actor} {log.action} {log.entity}
          </div>
        ))}
      </div>
    </div>
  );
}
