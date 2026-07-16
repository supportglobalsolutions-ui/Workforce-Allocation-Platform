'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import KpiCard from '@/components/platform/KpiCard';
import { Users, Activity, DollarSign, Server, TrendingUp, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';

interface Worker { id: string; status: string }
interface WorkSession { id: string; end_time: string | null }
interface RDPResource { id: string; status: string }
interface QualityScore { composite_score: number }
interface AuditLog { id: string; actor_id: string | null; action: string; target_type: string; target_id: string; created_at: string }
interface PayrollLineItem { id: string; exception_flags: unknown[] }

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function AdminDashboard() {
  const { session } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workersOnline, setWorkersOnline] = useState(0);
  const [activeSessions, setActiveSessions] = useState(0);
  const [machinesOnline, setMachinesOnline] = useState(0);
  const [qualityIndex, setQualityIndex] = useState<string>('—');
  const [exceptions, setExceptions] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    // Greeting name — worker username preferred; admins without a worker row fall back to their account name
    api.get<{ username: string | null }>('/workers/me')
      .then((w) => setUsername(w.username))
      .catch(() => {});
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

  const rawName = username || session?.displayName || '';
  const name = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : '';

  return (
    <div className="space-y-6">
      {/* Greeting header — title left, month pill right */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-theme-heading tracking-tight">Admin Command Center</h1>
          <p className="text-sm text-theme-muted mt-1">
            {greeting()}{name ? ` ${name}` : ''}, here&apos;s your operations overview.
          </p>
        </div>
        <span className="shrink-0 px-4 py-1.5 rounded-full border border-theme bg-theme-card text-xs font-semibold text-theme-muted">
          {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Workers Online" value={workersOnline} icon={Users} />
        <KpiCard label="Active Sessions" value={activeSessions} icon={Activity} accent="blue" />
        <KpiCard label="Payroll Pending" value="—" icon={DollarSign} accent="gold" highlight />
        <KpiCard label="Machines Online" value={machinesOnline} icon={Server} />
        <KpiCard label="Quality Index" value={qualityIndex} icon={TrendingUp} />
        <KpiCard label="Exceptions" value={exceptions} icon={AlertTriangle} accent="danger" />
      </div>

      {/* Lower layout — activity table left (2/3), stacked panels right (1/3) */}
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 glass-panel">
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <h2 className="text-base font-bold text-theme-heading">Live activity</h2>
            <Link href="/admin/audit-logs" className="text-xs font-semibold text-emerald-accent hover:underline">
              View all logs
            </Link>
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-theme-muted px-6 pb-6">No recent activity.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-b border-theme">
                  <th className="text-left px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Time</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Actor</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Action</th>
                  <th className="text-left px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">Target</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} className="border-b border-theme last:border-0">
                    <td className="px-6 py-3 text-xs font-mono text-theme-muted whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-theme-heading whitespace-nowrap">
                      {log.actor_id ? `${log.actor_id.slice(0, 8)}…` : 'System'}
                    </td>
                    <td className="px-4 py-3 text-emerald-accent font-semibold">{log.action}</td>
                    <td className="px-6 py-3 text-theme-muted hidden md:table-cell">
                      {log.target_type} {log.target_id.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="glass-panel">
            <h2 className="text-base font-bold text-theme-heading px-6 pt-5 pb-3 border-b border-theme">Session trends</h2>
            <p className="text-sm text-theme-muted px-6 py-4">No trend data available yet.</p>
          </div>
          <div className="glass-panel">
            <h2 className="text-base font-bold text-theme-heading px-6 pt-5 pb-3 border-b border-theme">Country performance</h2>
            <p className="text-sm text-theme-muted px-6 py-4">No country breakdown available yet.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
