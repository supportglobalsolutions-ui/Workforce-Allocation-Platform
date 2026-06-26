'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import { Users, Activity, DollarSign, Server, TrendingUp, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

interface Worker { id: string; status: string }
interface WorkSession { id: string; end_time: string | null }
interface RDPResource { id: string; status: string }
interface QualityScore { composite_score: number }
interface AuditLog { id: string; actor_id: string | null; action: string; target_type: string; target_id: string; created_at: string }
interface PayrollLineItem { id: string; exception_flags: unknown[] }

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workersOnline, setWorkersOnline] = useState(0);
  const [activeSessions, setActiveSessions] = useState(0);
  const [machinesOnline, setMachinesOnline] = useState(0);
  const [qualityIndex, setQualityIndex] = useState<string>('—');
  const [exceptions, setExceptions] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<Worker[]>('/workers'),
      api.get<WorkSession[]>('/sessions?limit=200'),
      api.get<RDPResource[]>('/rdp'),
      api.get<QualityScore[]>('/quality/scores'),
      api.get<PayrollLineItem[]>('/payroll/line-items'),
      api.get<AuditLog[]>('/audit?limit=10'),
    ])
      .then(([workers, sessions, machines, scores, lineItems, logs]) => {
        setWorkersOnline(workers.filter((w) => w.status === 'active').length);
        setActiveSessions(sessions.filter((s) => !s.end_time).length);
        setMachinesOnline(machines.filter((m) => !['offline', 'maintenance'].includes(m.status)).length);
        if (scores.length > 0) {
          const avg = scores.reduce((sum, s) => sum + Number(s.composite_score), 0) / scores.length;
          setQualityIndex(`${avg.toFixed(1)}%`);
        }
        setExceptions(lineItems.filter((i) => (i.exception_flags?.length ?? 0) > 0).length);
        setAuditLogs(logs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-theme-muted text-sm mt-4">Loading dashboard...</p>;
  if (error) return <p className="text-danger text-sm mt-4">{error}</p>;

  return (
    <div>
      <PageHeader
        title="Admin Command Center"
        description="Operations overview — workers, active sessions, payroll status, system health, and live activity."
      />
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <KpiCard label="Workers Online" value={workersOnline} icon={Users} />
        <KpiCard label="Active Sessions" value={activeSessions} icon={Activity} accent="blue" />
        <KpiCard label="Payroll Pending" value="—" icon={DollarSign} accent="gold" />
        <KpiCard label="Machines Online" value={machinesOnline} icon={Server} />
        <KpiCard label="Quality Index" value={qualityIndex} icon={TrendingUp} />
        <KpiCard label="Exceptions" value={exceptions} icon={AlertTriangle} accent="danger" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h2 className="text-sm font-bold text-white mb-4">Session Trends</h2>
          <p className="text-sm text-brand-on-surface-variant">No trend data available yet.</p>
        </div>
        <div className="glass-panel p-6">
          <h2 className="text-sm font-bold text-white mb-4">Country Performance</h2>
          <p className="text-sm text-brand-on-surface-variant">No country breakdown available yet.</p>
        </div>
      </div>
      <div className="glass-panel p-6 mt-6">
        <h2 className="text-sm font-bold text-white mb-4">Live Activity Feed</h2>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-brand-on-surface-variant">No recent activity.</p>
        ) : (
          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex flex-wrap gap-2 text-sm py-2 border-b border-white/[0.03] last:border-0">
                <span className="text-brand-on-surface-variant font-mono text-xs">
                  {new Date(log.created_at).toLocaleString()}
                </span>
                <span className="text-white font-medium">
                  {log.actor_id ? `${log.actor_id.slice(0, 8)}…` : 'System'}
                </span>
                <span className="text-emerald-accent">{log.action}</span>
                <span className="text-brand-on-surface-variant">
                  on {log.target_type} {log.target_id.slice(0, 8)}…
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
