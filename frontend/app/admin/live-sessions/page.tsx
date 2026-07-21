'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { SESSIONS_TABS } from '@/components/platform/AdminSectionTabs';
import FilterBar from '@/components/platform/FilterBar';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';

interface WorkSession {
  id: string;
  worker_id: string;
  session_type: string;
  rdp_resource_id: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  type_specific_fields: Record<string, unknown>;
}

interface Worker {
  id: string;
  display_name: string;
}

interface RDPResource {
  id: string;
  nickname: string;
}

const TYPE_LABELS: Record<string, string> = {
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

function formatDuration(minutes: number | null, startTime: string): string {
  if (minutes != null) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 60000);
  return `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`;
}

export default function LiveSessionMonitorPage() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<WorkSession[]>('/sessions?limit=200'),
      api.get<Worker[]>('/workers'),
      api.get<RDPResource[]>('/rdp'),
    ])
      .then(([sessionList, workerList, machineList]) => {
        setSessions(sessionList.filter((s) => !s.end_time));
        setWorkers(workerList);
        setMachines(machineList);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load sessions'))
      .finally(() => setLoading(false));
  }, []);

  const workerName = (id: string) => workers.find((w) => w.id === id)?.display_name ?? `${id.slice(0, 8)}…`;
  const machineName = (id: string | null) => {
    if (!id) return '—';
    return machines.find((m) => m.id === id)?.nickname ?? `${id.slice(0, 8)}…`;
  };

  return (
    <div>
      <PageHeader
        title="Live Session Monitor"
        description="Real-time oversight of all active sessions with force-end and audit capabilities."
        actions={
          <span className="flex items-center gap-2 text-xs font-mono text-emerald-accent">
            <span className="w-2 h-2 rounded-full bg-emerald-accent animate-pulse" />
            {sessions.length} active
          </span>
        }
      />
      <AdminSectionTabs tabs={SESSIONS_TABS} />
      <FilterBar
        searchPlaceholder="Search by worker or machine..."
        filters={[
          { label: 'Type', options: ['GS RDP', 'Partner Multilog', 'Third Party'] },
          { label: 'Heartbeat', options: ['Active', 'Idle', 'Missing'] },
        ]}
      />
      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading sessions...</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : sessions.length === 0 ? (
        <p className="text-theme-muted text-sm mt-4">No active sessions right now.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const heartbeat = (s.type_specific_fields?.last_heartbeat_at as string | undefined) ? 'active' : 'idle';
            return (
              <div key={s.id} className="glass-panel p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-brand-on-surface-variant">{s.id.slice(0, 8)}…</span>
                      <StatusBadge status="active" />
                      <StatusBadge status={heartbeat === 'active' ? 'approved' : 'idle'} label={`Heartbeat: ${heartbeat}`} />
                    </div>
                    <p className="font-bold text-white">{workerName(s.worker_id)}</p>
                    <p className="text-xs text-brand-on-surface-variant">
                      {machineName(s.rdp_resource_id)} · {TYPE_LABELS[s.session_type] ?? s.session_type} · Started{' '}
                      {new Date(s.start_time).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-2xl font-mono font-black text-emerald-accent">
                      {formatDuration(s.duration_minutes, s.start_time)}
                    </p>
                    <button className="btn-secondary text-xs border-danger/30 text-danger">Force End</button>
                    <button className="btn-secondary text-xs">Audit View</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
