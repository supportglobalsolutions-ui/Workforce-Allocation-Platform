'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { 
  FileText, Search, ShieldAlert, ArrowDownRight, 
  Terminal, User, HardDrive, Calendar, CreditCard
} from 'lucide-react';

interface AuditLog {
  id: string;
  actor: string;
  role: string;
  action: string;
  targetType: 'Worker' | 'RDP' | 'Shift' | 'System' | 'Payroll';
  targetId: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  timestamp: string;
  metadata: string;
}

const initialLogs: AuditLog[] = [
  { id: 'LOG-8812', actor: 'Admin Lead', role: 'Ops Supervisor', action: 'Force Released RDP Session', targetType: 'RDP', targetId: 'RDP-02', severity: 'WARN', timestamp: '2026-06-04 15:11:05', metadata: '{"worker_id": "W-045", "reason": "Idle threshold exceeded (12m)"}' },
  { id: 'LOG-8810', actor: 'Kibiru Kelvin', role: 'System Worker', action: 'Claimed RDP Session', targetType: 'RDP', targetId: 'RDP-01', severity: 'INFO', timestamp: '2026-06-04 08:02:14', metadata: '{"shift_id": "S-2098", "guacamole_token": "g_84b2c89f..."}' },
  { id: 'LOG-8809', actor: 'Admin Lead', role: 'Ops Supervisor', action: 'Modified Quality Index Score', targetType: 'Worker', targetId: 'W-001', severity: 'INFO', timestamp: '2026-06-04 07:44:22', metadata: '{"added_rating": 5, "avg_comm_score": 4.8}' },
  { id: 'LOG-8805', actor: 'Uptime Monitor', role: 'Watchdog System', action: 'Detected RDP Connectivity Drop', targetType: 'System', targetId: 'RDP-08', severity: 'CRITICAL', timestamp: '2026-06-04 05:30:00', metadata: '{"port": 3389, "error": "Connection timed out", "retries": 3}' },
  { id: 'LOG-8801', actor: 'Luther Rukhairo', role: 'Chief Executive', action: 'Approved Payroll Period Period', targetType: 'Payroll', targetId: 'PP-2026-05', severity: 'INFO', timestamp: '2026-06-03 16:20:11', metadata: '{"period_start": "2026-05-01", "period_end": "2026-05-31", "gross_payout_usd": 14240}' },
  { id: 'LOG-8798', actor: 'Admin Lead', role: 'Ops Supervisor', action: 'Assigned RDP to Approved Shift', targetType: 'Shift', targetId: 'SF-9482', severity: 'INFO', timestamp: '2026-06-03 14:02:55', metadata: '{"shift_date": "2026-06-04", "rdp_assigned": "RDP-07"}' },
  { id: 'LOG-8795', actor: 'Jane Doe', role: 'System Worker', action: 'Submitted Availability Request', targetType: 'Shift', targetId: 'SF-9486', severity: 'INFO', timestamp: '2026-06-03 10:15:33', metadata: '{"slots": ["2026-06-05 08:00-12:00", "2026-06-05 12:00-16:00"]}' }
];

export default function AuditLogs() {
  const [logs] = useState<AuditLog[]>(initialLogs);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  const getSeverityStyle = (severity: AuditLog['severity']) => {
    switch (severity) {
      case 'INFO':
        return 'text-[#61e3bb] border-[#61e3bb]/20 bg-[#61e3bb]/5';
      case 'WARN':
        return 'text-amber-400 border-amber-500/20 bg-amber-950/20';
      case 'CRITICAL':
        return 'text-red-400 border-red-500/20 bg-red-950/20';
    }
  };

  const getTargetIcon = (targetType: AuditLog['targetType']) => {
    switch (targetType) {
      case 'Worker':
        return <User size={12} className="text-slate-400" />;
      case 'RDP':
        return <HardDrive size={12} className="text-[#61e3bb]" />;
      case 'Shift':
        return <Calendar size={12} className="text-[#e9c349]" />;
      case 'System':
        return <Terminal size={12} className="text-red-400" />;
      case 'Payroll':
        return <CreditCard size={12} className="text-blue-400" />;
    }
  };

  const filteredLogs = logs.filter(l => {
    const matchesSearch = l.actor.toLowerCase().includes(search.toLowerCase()) ||
                          l.action.toLowerCase().includes(search.toLowerCase()) ||
                          l.targetId.toLowerCase().includes(search.toLowerCase()) ||
                          l.metadata.toLowerCase().includes(search.toLowerCase());
    const matchesSeverity = severityFilter === 'ALL' || l.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  return (
    <DashboardLayout>
      <header className="mb-8">
        <h2 className="text-3xl font-black text-white tracking-tight leading-none">Security Audit Trail</h2>
        <p className="text-[#bbcac2] mt-2 text-sm">Read-only immutable logs of all dashboard, RDP gateway, and scheduling transactions.</p>
      </header>

      {/* Control Bar */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
        <div className="flex gap-2">
          {['ALL', 'INFO', 'WARN', 'CRITICAL'].map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                severityFilter === s 
                  ? 'bg-[#142f28] text-[#61e3bb] border border-[#61e3bb]/30' 
                  : 'text-[#bbcac2] hover:text-white hover:bg-white/[0.02]'
              }`}
            >
              {s === 'ALL' ? 'All Severities' : s}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter logs by actor, action or data..."
            className="w-full px-4 py-2.5 pl-10 rounded-xl bg-[#00110d]/60 border border-white/10 text-white placeholder-slate-500 focus:ring-2 focus:ring-[#61e3bb]/20 focus:border-[#61e3bb] outline-none text-xs font-medium"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
        </div>
      </div>

      {/* Logs Table */}
      <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-medium">
            <thead className="bg-[#00110d]/40 text-[#bbcac2] font-bold border-b border-white/5 uppercase font-mono text-[10px]">
              <tr>
                <th className="p-4">Log Token</th>
                <th className="p-4">Commit Timestamp</th>
                <th className="p-4">Actor</th>
                <th className="p-4">Transaction / Operation</th>
                <th className="p-4">Target Ref</th>
                <th className="p-4">Severity</th>
                <th className="p-4">Metadata Payload (JSON)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {filteredLogs.map((l) => (
                <tr key={l.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="p-4 font-mono text-slate-500">{l.id}</td>
                  <td className="p-4 font-mono text-slate-400">{l.timestamp}</td>
                  <td className="p-4">
                    <div>
                      <span className="font-bold text-white block leading-tight">{l.actor}</span>
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{l.role}</span>
                    </div>
                  </td>
                  <td className="p-4 font-bold text-white">{l.action}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 font-mono text-slate-300">
                      {getTargetIcon(l.targetType)}
                      <span className="font-bold text-xs">{l.targetId}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase font-mono ${getSeverityStyle(l.severity)}`}>
                      {l.severity}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-[10px] text-slate-400 max-w-[200px] truncate" title={l.metadata}>
                    {l.metadata}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
