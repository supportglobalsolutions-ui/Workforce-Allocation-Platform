'use client';

import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import StatusBadge from '@/components/platform/StatusBadge';

const activeSessions = [
  { id: 'SES-482', worker: 'Sarah Mwangi', machine: 'RDP-KE-002', type: 'GS RDP', started: '09:15', duration: '4h 23m', heartbeat: 'active' },
  { id: 'SES-481', worker: 'James Okonkwo', machine: 'RDP-NG-001', type: 'GS RDP', started: '08:00', duration: '5h 38m', heartbeat: 'idle' },
  { id: 'SES-480', worker: 'Grace Nakato', machine: 'RDP-UG-002', type: 'GS RDP', started: '07:30', duration: '6h 08m', heartbeat: 'active' },
];

export default function LiveSessionMonitorPage() {
  return (
    <div>
      <PageHeader
        title="Live Session Monitor"
        description="Real-time oversight of all active sessions with force-end and audit capabilities."
        actions={<span className="flex items-center gap-2 text-xs font-mono text-emerald-accent"><span className="w-2 h-2 rounded-full bg-emerald-accent animate-pulse" />{activeSessions.length} active</span>}
      />
      <FilterBar
        searchPlaceholder="Search by worker or machine..."
        filters={[
          { label: 'Type', options: ['GS RDP', 'Partner Multilog', 'Third Party'] },
          { label: 'Heartbeat', options: ['Active', 'Idle', 'Missing'] },
        ]}
      />
      <div className="space-y-3">
        {activeSessions.map((s) => (
          <div key={s.id} className="glass-panel p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-brand-on-surface-variant">{s.id}</span>
                  <StatusBadge status="active" />
                  <StatusBadge status={s.heartbeat === 'active' ? 'approved' : 'idle'} label={`Heartbeat: ${s.heartbeat}`} />
                </div>
                <p className="font-bold text-white">{s.worker}</p>
                <p className="text-xs text-brand-on-surface-variant">{s.machine} · {s.type} · Started {s.started}</p>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-2xl font-mono font-black text-emerald-accent">{s.duration}</p>
                <button className="btn-secondary text-xs border-danger/30 text-danger">Force End</button>
                <button className="btn-secondary text-xs">Audit View</button>
              </div>
            </div>
            <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-accent/60 rounded-full w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
