'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Monitor, Play, User, Clock, AlertTriangle, ShieldCheck, 
  Settings, Power, Lock, Unlock, Search, CheckCircle, XCircle 
} from 'lucide-react';

interface RDPMachine {
  id: string;
  name: string;
  ip: string;
  status: 'ONLINE_FREE' | 'ACTIVE' | 'OFFLINE' | 'IDLE' | 'UNHEALTHY' | 'ASSIGNED' | 'ADMIN_LOCKED';
  assignedTo?: string;
  assignedId?: string;
  duration?: number; // minutes active
  country: 'KE' | 'UK' | 'NG';
}

const initialMachines: RDPMachine[] = [
  { id: 'RDP-01', name: 'RDP-01-PROD', ip: '10.0.1.15', status: 'ACTIVE', assignedTo: 'Kibiru Kelvin', assignedId: 'W-001', duration: 145, country: 'KE' },
  { id: 'RDP-02', name: 'RDP-02-PROD', ip: '10.0.1.16', status: 'IDLE', assignedTo: 'Jane Doe', assignedId: 'W-045', duration: 320, country: 'NG' },
  { id: 'RDP-03', name: 'RDP-03-FREE', ip: '10.0.1.17', status: 'ONLINE_FREE', country: 'KE' },
  { id: 'RDP-04', name: 'RDP-04-PROD', ip: '10.0.1.18', status: 'ASSIGNED', assignedTo: 'John Kamau', assignedId: 'W-012', country: 'KE' },
  { id: 'RDP-05', name: 'RDP-05-FREE', ip: '10.0.1.19', status: 'ONLINE_FREE', country: 'NG' },
  { id: 'RDP-06', name: 'RDP-06-PROD', ip: '10.0.1.20', status: 'OFFLINE', country: 'UK' },
  { id: 'RDP-07', name: 'RDP-07-PROD', ip: '10.0.1.21', status: 'ACTIVE', assignedTo: 'Sarah Jenkins', assignedId: 'W-088', duration: 42, country: 'UK' },
  { id: 'RDP-08', name: 'RDP-08-PROD', ip: '10.0.1.22', status: 'UNHEALTHY', country: 'NG' },
  { id: 'RDP-09', name: 'RDP-09-PROD', ip: '10.0.1.23', status: 'ADMIN_LOCKED', country: 'KE' },
  { id: 'RDP-10', name: 'RDP-10-FREE', ip: '10.0.1.24', status: 'ONLINE_FREE', country: 'UK' },
  { id: 'RDP-11', name: 'RDP-11-FREE', ip: '10.0.1.25', status: 'ONLINE_FREE', country: 'KE' },
  { id: 'RDP-12', name: 'RDP-12-FREE', ip: '10.0.1.26', status: 'ONLINE_FREE', country: 'NG' },
];

export default function CommandCenter() {
  const [machines, setMachines] = useState<RDPMachine[]>(initialMachines);
  const [filter, setFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [alerts, setAlerts] = useState([
    { id: 'a1', type: 'critical', text: 'Health Check Failed: RDP-08 port 3389 not responding.' },
    { id: 'a2', type: 'warning', text: 'Idle Threshold Warning: RDP-02 (Jane Doe) idle for 12 minutes.' },
  ]);

  const handleForceRelease = (machineId: string) => {
    setMachines(prev => prev.map(m => {
      if (m.id === machineId) {
        return {
          ...m,
          status: 'ONLINE_FREE',
          assignedTo: undefined,
          assignedId: undefined,
          duration: undefined
        };
      }
      return m;
    }));
    // Remove warning alert if related
    if (machineId === 'RDP-02') {
      setAlerts(prev => prev.filter(a => a.id !== 'a2'));
    }
  };

  const handleLockUnlock = (machineId: string) => {
    setMachines(prev => prev.map(m => {
      if (m.id === machineId) {
        return {
          ...m,
          status: m.status === 'ADMIN_LOCKED' ? 'ONLINE_FREE' : 'ADMIN_LOCKED',
          assignedTo: undefined,
          assignedId: undefined,
          duration: undefined
        };
      }
      return m;
    }));
  };

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const getStatusBadge = (status: RDPMachine['status']) => {
    switch (status) {
      case 'ONLINE_FREE':
        return { text: 'Online Free', classes: 'bg-emerald-950/50 text-[#61e3bb] border-emerald-500/20' };
      case 'ACTIVE':
        return { text: 'Active Session', classes: 'bg-red-950/50 text-red-400 border-red-500/20' };
      case 'IDLE':
        return { text: 'Idle Warn', classes: 'bg-amber-950/50 text-amber-400 border-amber-500/20' };
      case 'ASSIGNED':
        return { text: 'Assigned', classes: 'bg-blue-950/50 text-blue-400 border-blue-500/20' };
      case 'OFFLINE':
        return { text: 'Offline', classes: 'bg-slate-900/60 text-slate-400 border-slate-700/25' };
      case 'UNHEALTHY':
        return { text: 'Unhealthy', classes: 'bg-orange-950/50 text-orange-400 border-orange-500/20' };
      case 'ADMIN_LOCKED':
        return { text: 'Admin Locked', classes: 'bg-rose-950/70 text-rose-300 border-rose-600/30' };
    }
  };

  const filteredMachines = machines.filter(m => {
    const matchesSearch = m.id.toLowerCase().includes(search.toLowerCase()) || 
                          m.name.toLowerCase().includes(search.toLowerCase()) ||
                          (m.assignedTo && m.assignedTo.toLowerCase().includes(search.toLowerCase()));
    
    if (filter === 'ALL') return matchesSearch;
    if (filter === 'ACTIVE') return matchesSearch && (m.status === 'ACTIVE' || m.status === 'IDLE');
    if (filter === 'FREE') return matchesSearch && m.status === 'ONLINE_FREE';
    if (filter === 'WARNING') return matchesSearch && (m.status === 'UNHEALTHY' || m.status === 'IDLE');
    if (filter === 'OFFLINE') return matchesSearch && m.status === 'OFFLINE';
    return matchesSearch;
  });

  const activeSessions = machines.filter(m => m.status === 'ACTIVE' || m.status === 'IDLE');

  return (
    <DashboardLayout>
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight leading-none">Operations Command Center</h2>
          <p className="text-[#bbcac2] mt-2 text-sm">Real-time status board of RDP allocations and heartbeat indicators.</p>
        </div>
        <div className="flex gap-2.5">
          <div className="glass-panel px-4 py-2 rounded-xl flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#61e3bb] animate-pulse" />
            <span className="text-xs font-bold font-mono">10.0.1.0/24 VNET</span>
          </div>
        </div>
      </header>

      {/* Real-time alerts banner */}
      <AnimatePresence>
        {alerts.length > 0 && (
          <div className="mb-8 space-y-2">
            {alerts.map(a => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`p-4 rounded-2xl border flex items-center justify-between backdrop-blur-md ${
                  a.type === 'critical' 
                    ? 'bg-red-950/30 border-red-500/20 text-[#ffb4ab]' 
                    : 'bg-amber-950/30 border-amber-500/20 text-amber-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle size={18} className="shrink-0" />
                  <span className="text-xs font-bold leading-tight font-sans">{a.text}</span>
                </div>
                <button 
                  onClick={() => dismissAlert(a.id)}
                  className="text-[10px] uppercase font-bold tracking-wider hover:underline"
                >
                  Dismiss
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard title="Total Capacity" value={machines.length} subtitle="Allocated Virtual Machines" icon={<Monitor size={20} className="text-slate-400" />} />
        <SummaryCard title="Live Sessions" value={activeSessions.length} subtitle="Actively claimed shifts" color="text-[#61e3bb]" icon={<Play size={20} className="text-[#61e3bb]" />} />
        <SummaryCard title="Unassigned Pools" value={machines.filter(m => m.status === 'ONLINE_FREE').length} subtitle="Ready for allocation" color="text-[#9ddac0]" icon={<ShieldCheck size={20} className="text-[#9ddac0]" />} />
        <SummaryCard title="Anomalies flagged" value={alerts.length} subtitle="Failing health/heartbeats" color="text-[#e9c349]" icon={<AlertTriangle size={20} className="text-[#e9c349]" />} />
      </div>

      {/* Control Bar */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
        {/* State filters */}
        <div className="flex flex-wrap gap-1">
          {['ALL', 'ACTIVE', 'FREE', 'WARNING', 'OFFLINE'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                filter === f 
                  ? 'bg-[#142f28] text-[#61e3bb] border border-[#61e3bb]/30' 
                  : 'text-[#bbcac2] hover:text-white hover:bg-white/[0.02]'
              }`}
            >
              {f === 'ALL' ? 'All Machines' : f === 'FREE' ? 'Unassigned' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search RDP or Active Worker..."
            className="w-full px-4 py-2.5 pl-10 rounded-xl bg-[#00110d]/60 border border-white/10 text-white placeholder-slate-500 focus:ring-2 focus:ring-[#61e3bb]/20 focus:border-[#61e3bb] outline-none text-xs font-medium"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
        </div>
      </div>

      {/* RDP Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {filteredMachines.map((m) => {
          const badge = getStatusBadge(m.status);
          return (
            <motion.div
              layout
              key={m.id}
              className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col justify-between h-44 hover:border-white/10 hover:bg-[#08241e]/50 transition-all duration-300 relative group overflow-hidden"
            >
              {/* Dynamic status colored glow behind cards */}
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] pointer-events-none opacity-[0.03] transition-all duration-500 ${
                m.status === 'ACTIVE' || m.status === 'IDLE' ? 'bg-red-500' : m.status === 'ONLINE_FREE' ? 'bg-[#61e3bb]' : 'bg-slate-400'
              }`} />

              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-white tracking-tight text-sm">{m.name}</h3>
                  <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{m.ip}</span>
                </div>
                <span className={`px-2 py-0.5 text-[9px] font-bold rounded border uppercase ${badge.classes}`}>
                  {badge.text}
                </span>
              </div>

              <div className="mb-4">
                {m.assignedTo ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                      <User size={10} className="text-[#61e3bb]" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block truncate leading-tight">{m.assignedTo}</span>
                      <span className="text-[9px] text-[#bbcac2] block font-mono">
                        Active {m.duration}m
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs italic">
                    {m.status === 'ADMIN_LOCKED' ? 'Locked out' : 'Ready for shift link'}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center border-t border-white/5 pt-3">
                <span className="text-[9px] font-mono font-bold text-[#e9c349]">
                  LOC: {m.country}
                </span>

                <div className="flex gap-2">
                  {/* Actions */}
                  {(m.status === 'ACTIVE' || m.status === 'IDLE') && (
                    <button
                      onClick={() => handleForceRelease(m.id)}
                      className="px-2 py-1 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-500/20 text-red-400 text-[9px] font-bold uppercase transition-all"
                    >
                      Release
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleLockUnlock(m.id)}
                    className="p-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all"
                    title={m.status === 'ADMIN_LOCKED' ? 'Unlock RDP' : 'Admin Lock RDP'}
                  >
                    {m.status === 'ADMIN_LOCKED' ? <Unlock size={10} /> : <Lock size={10} />}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Active Session Detail Logs */}
      <section className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#00110d]/40">
          <h3 className="text-base font-bold text-white leading-none">Live Active Sessions</h3>
          <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[#61e3bb]">
            {activeSessions.length} connected clients
          </span>
        </div>

        {activeSessions.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-xs italic">
            No workers currently connected to any machines.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium">
              <thead className="bg-white/[0.01] text-[#bbcac2] font-bold border-b border-white/5 uppercase font-mono text-[10px]">
                <tr>
                  <th className="p-4">Session Client</th>
                  <th className="p-4">RDP Machine</th>
                  <th className="p-4">IP Target</th>
                  <th className="p-4">Connected Duration</th>
                  <th className="p-4">Guacamole Protocol</th>
                  <th className="p-4 text-right">Emergency Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {activeSessions.map((s) => (
                  <tr key={s.id} className="hover:bg-white/[0.01] transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#142f28] border border-white/10 flex items-center justify-center font-bold text-[#61e3bb]">
                          {s.assignedTo?.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <span className="font-bold text-white block leading-snug">{s.assignedTo}</span>
                          <span className="text-[10px] text-slate-500 font-mono block">{s.assignedId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-bold text-white">{s.name}</td>
                    <td className="p-4 font-mono text-slate-400">{s.ip}:3389</td>
                    <td className="p-4 font-mono text-[#e9c349] font-bold">
                      {s.duration} min
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/40 text-[#61e3bb] border border-emerald-500/20 text-[10px] font-mono leading-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#61e3bb] animate-pulse" />
                        WEBRTC-RDP
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleForceRelease(s.id)}
                        className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-500/20 rounded-lg text-red-400 font-bold uppercase transition-all"
                      >
                        Force Release
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}

function SummaryCard({ title, value, subtitle, color = 'text-white', icon }: { title: string, value: number | string, subtitle: string, color?: string, icon?: React.ReactNode }) {
  return (
    <div className="glass-panel p-5 rounded-2xl border border-white/5 flex items-center justify-between hover:border-white/10 transition-all duration-300">
      <div>
        <span className="text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider block leading-none">{title}</span>
        <span className={`text-2xl font-black mt-2 block leading-none font-sans ${color}`}>{value}</span>
        <span className="text-[10px] text-slate-500 font-medium block mt-1.5 leading-snug">{subtitle}</span>
      </div>
      <div className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center shadow-inner">
        {icon}
      </div>
    </div>
  );
}
