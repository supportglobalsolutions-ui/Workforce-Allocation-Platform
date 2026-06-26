'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import { Users, Activity, DollarSign, Star, Globe2, Server } from 'lucide-react';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';

interface Worker { id: string; status: string }
interface WorkSession { id: string; end_time: string | null }
interface RDPResource { id: string; nickname: string; status: string }
interface LeaderboardEntry { id: string; worker_display_name: string; composite_score: number; global_rank: number | null }
interface AuditLog { id: string; actor_id: string | null; action: string; target_type: string; target_id: string; created_at: string }
interface QualityScore { composite_score: number }

export default function CeoCommandCenterPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workersOnline, setWorkersOnline] = useState(0);
  const [activeSessions, setActiveSessions] = useState(0);
  const [revenue, setRevenue] = useState('—');
  const [qualityIndex, setQualityIndex] = useState('—');
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<Worker[]>('/workers'),
      api.get<WorkSession[]>('/sessions?limit=200'),
      api.get<RDPResource[]>('/rdp'),
      api.get<LeaderboardEntry[]>('/leaderboard?limit=5'),
      api.get<AuditLog[]>('/audit?limit=10'),
      api.get<QualityScore[]>('/quality/scores'),
      api.get<{ worker_net: number }[]>('/payroll/line-items'),
    ])
      .then(([workers, sessions, rdpList, leaders, logs, scores, lineItems]) => {
        setWorkersOnline(workers.filter((w) => w.status === 'active').length);
        setActiveSessions(sessions.filter((s) => !s.end_time).length);
        setMachines(rdpList);
        setLeaderboard(leaders);
        setAuditLogs(logs);
        if (scores.length > 0) {
          const avg = scores.reduce((sum, s) => sum + Number(s.composite_score), 0) / scores.length;
          setQualityIndex(`${avg.toFixed(1)}%`);
        }
        if (lineItems.length > 0) {
          const total = lineItems.reduce((sum, i) => sum + Number(i.worker_net ?? 0), 0);
          setRevenue(total >= 1000 ? `£${(total / 1000).toFixed(0)}K` : `£${total.toFixed(0)}`);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-theme-muted text-sm mt-4">Loading command center...</p>;
  if (error) return <p className="text-danger text-sm mt-4">{error}</p>;

  return (
    <div>
      <PageHeader
        title="CEO Command Center"
        description="Executive command view — real-time organisation state across workers, sessions, revenue, and quality."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Workers Online" value={workersOnline} icon={Users} />
        <KpiCard label="Active Sessions" value={activeSessions} icon={Activity} accent="blue" />
        <KpiCard label="Revenue" value={revenue} icon={DollarSign} accent="gold" />
        <KpiCard label="Quality Index" value={qualityIndex} icon={Star} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="glass-panel p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4"><Globe2 size={18} className="text-emerald-accent" /><h2 className="font-bold text-white">World Activity Map</h2></div>
          <div className="h-48 rounded-xl bg-brand-primary-dark/50 border border-white/5 flex items-center justify-center">
            <p className="text-sm text-brand-on-surface-variant">Geographic activity data not available yet.</p>
          </div>
        </div>
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4"><Server size={18} className="text-emerald-accent" /><h2 className="font-bold text-white">Machine Status</h2></div>
          {machines.length === 0 ? (
            <p className="text-sm text-brand-on-surface-variant">No machines configured.</p>
          ) : (
            <div className="space-y-2">
              {machines.slice(0, 4).map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-white truncate">{m.nickname}</span>
                  <StatusBadge status={m.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="glass-panel p-6">
          <h2 className="font-bold text-white mb-4">Partner Performance</h2>
          <p className="text-sm text-brand-on-surface-variant">No partner data available yet.</p>
        </div>
        <div className="glass-panel p-6">
          <h2 className="font-bold text-white mb-4">Top Workers</h2>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-brand-on-surface-variant">No leaderboard data yet.</p>
          ) : (
            leaderboard.map((w, i) => (
              <div key={w.id} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
                <span className="text-sm text-white">#{w.global_rank ?? i + 1} {w.worker_display_name}</span>
                <span className="text-sm font-mono text-emerald-accent">{Number(w.composite_score).toFixed(1)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="glass-panel p-6">
        <h2 className="font-bold text-white mb-4">Live Activity Feed</h2>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-brand-on-surface-variant">No recent activity.</p>
        ) : (
          auditLogs.map((log) => (
            <div key={log.id} className="text-sm py-2 border-b border-white/[0.03] last:border-0 text-brand-on-surface-variant">
              <span className="font-mono text-xs">{new Date(log.created_at).toLocaleString()}</span>
              {' — '}
              {log.actor_id ? `${log.actor_id.slice(0, 8)}…` : 'System'} {log.action} {log.target_type} {log.target_id.slice(0, 8)}…
            </div>
          ))
        )}
      </div>
    </div>
  );
}
