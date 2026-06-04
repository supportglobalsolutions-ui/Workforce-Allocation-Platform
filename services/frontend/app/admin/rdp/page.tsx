'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { motion } from 'framer-motion';
import { 
  Monitor, Plus, Search, Trash2, ShieldAlert, CheckCircle, 
  Settings, Power, Lock, Unlock, Eye, RefreshCw, Server
} from 'lucide-react';

interface RDPMachine {
  id: string;
  name: string;
  ip: string;
  port: number;
  status: 'ONLINE_FREE' | 'ACTIVE' | 'OFFLINE' | 'IDLE' | 'UNHEALTHY' | 'ADMIN_LOCKED' | 'MAINTENANCE';
  country: 'KE' | 'UK' | 'NG';
  lastHealthCheck: string;
}

const initialRDPs: RDPMachine[] = [
  { id: 'RDP-01', name: 'RDP-01-PROD', ip: '10.0.1.15', port: 3389, status: 'ACTIVE', country: 'KE', lastHealthCheck: '10s ago' },
  { id: 'RDP-02', name: 'RDP-02-PROD', ip: '10.0.1.16', port: 3389, status: 'IDLE', country: 'NG', lastHealthCheck: '24s ago' },
  { id: 'RDP-03', name: 'RDP-03-FREE', ip: '10.0.1.17', port: 3389, status: 'ONLINE_FREE', country: 'KE', lastHealthCheck: '5s ago' },
  { id: 'RDP-04', name: 'RDP-04-PROD', ip: '10.0.1.18', port: 3389, status: 'ACTIVE', country: 'KE', lastHealthCheck: '14s ago' },
  { id: 'RDP-05', name: 'RDP-05-FREE', ip: '10.0.1.19', port: 3389, status: 'ONLINE_FREE', country: 'NG', lastHealthCheck: '29s ago' },
  { id: 'RDP-06', name: 'RDP-06-PROD', ip: '10.0.1.20', port: 3389, status: 'OFFLINE', country: 'UK', lastHealthCheck: '1m ago' },
  { id: 'RDP-07', name: 'RDP-07-PROD', ip: '10.0.1.21', port: 3389, status: 'ACTIVE', country: 'UK', lastHealthCheck: '40s ago' },
  { id: 'RDP-08', name: 'RDP-08-PROD', ip: '10.0.1.22', port: 3389, status: 'UNHEALTHY', country: 'NG', lastHealthCheck: '32s ago' },
  { id: 'RDP-09', name: 'RDP-09-PROD', ip: '10.0.1.23', port: 3389, status: 'ADMIN_LOCKED', country: 'KE', lastHealthCheck: '4m ago' },
];

export default function RDPResourceManager() {
  const [rdps, setRdps] = useState<RDPMachine[]>(initialRDPs);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALL');

  // Form Inputs
  const [newName, setNewName] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newPort, setNewPort] = useState(3389);
  const [newCountry, setNewCountry] = useState<'KE' | 'UK' | 'NG'>('KE');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddRDP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newIp) return;

    const nextId = `RDP-0${rdps.length + 1}`;
    const newMachine: RDPMachine = {
      id: nextId,
      name: newName,
      ip: newIp,
      port: newPort,
      status: 'ONLINE_FREE',
      country: newCountry,
      lastHealthCheck: 'Just now'
    };

    setRdps([...rdps, newMachine]);
    setNewName('');
    setNewIp('');
    setNewPort(3389);
    setIsAdding(false);
  };

  const toggleStatus = (id: string, action: 'lock' | 'maintenance') => {
    setRdps(prev => prev.map(r => {
      if (r.id === id) {
        let nextStatus: RDPMachine['status'] = 'ONLINE_FREE';
        if (action === 'lock') {
          nextStatus = r.status === 'ADMIN_LOCKED' ? 'ONLINE_FREE' : 'ADMIN_LOCKED';
        } else if (action === 'maintenance') {
          nextStatus = r.status === 'MAINTENANCE' ? 'ONLINE_FREE' : 'MAINTENANCE';
        }
        return { ...r, status: nextStatus };
      }
      return r;
    }));
  };

  const handleDelete = (id: string) => {
    if (confirm(`Are you sure you want to decommission RDP instance ${id}?`)) {
      setRdps(prev => prev.filter(r => r.id !== id));
    }
  };

  const getStatusBadge = (status: RDPMachine['status']) => {
    switch (status) {
      case 'ONLINE_FREE':
        return 'text-[#61e3bb] border-[#61e3bb]/30 bg-[#61e3bb]/5';
      case 'ACTIVE':
        return 'text-red-400 border-red-500/20 bg-red-950/20';
      case 'IDLE':
        return 'text-amber-400 border-amber-500/20 bg-amber-950/20';
      case 'OFFLINE':
        return 'text-slate-400 border-slate-700/30 bg-slate-900/40';
      case 'UNHEALTHY':
        return 'text-orange-400 border-orange-500/20 bg-orange-950/20';
      case 'ADMIN_LOCKED':
        return 'text-rose-300 border-rose-600/30 bg-rose-950/40';
      case 'MAINTENANCE':
        return 'text-[#e9c349] border-[#e9c349]/30 bg-[#e9c349]/5';
    }
  };

  const filteredRdps = rdps.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
                          r.ip.toLowerCase().includes(search.toLowerCase()) ||
                          r.id.toLowerCase().includes(search.toLowerCase());
    const matchesRegion = regionFilter === 'ALL' || r.country === regionFilter;
    return matchesSearch && matchesRegion;
  });

  return (
    <DashboardLayout>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight leading-none">RDP Resource Manager</h2>
          <p className="text-[#bbcac2] mt-2 text-sm">Configure physical terminal hosts, assign network scopes, and configure RDP credentials rules.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-[#61e3bb] hover:bg-[#3fc7a0] text-[#00382a] px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(97,227,187,0.1)]"
        >
          <Plus size={16} />
          <span>Provision New Host</span>
        </button>
      </header>

      {/* Slide down form for adding */}
      {isAdding && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="glass-panel p-6 rounded-2xl border border-white/10 mb-8 overflow-hidden"
        >
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Provision Host Server</h3>
          <form onSubmit={handleAddRDP} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-1.5">Machine Label</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="RDP-10-PROD"
                className="w-full px-4 py-2.5 bg-[#00110d] border border-white/10 rounded-xl text-white text-xs font-semibold focus:border-[#61e3bb] outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-1.5">VNET Host IP Address</label>
              <input
                type="text"
                required
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="10.0.1.28"
                className="w-full px-4 py-2.5 bg-[#00110d] border border-white/10 rounded-xl text-white text-xs font-semibold focus:border-[#61e3bb] outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-1.5">Assign Region Pool</label>
              <select
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value as any)}
                className="w-full px-4 py-2.5 bg-[#00110d] border border-white/10 rounded-xl text-xs font-bold text-white outline-none focus:border-[#61e3bb] transition-all cursor-pointer"
              >
                <option value="KE">Kenya Pool (KE)</option>
                <option value="NG">Nigeria Pool (NG)</option>
                <option value="UK">United Kingdom Pool (UK)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-2.5 bg-[#61e3bb] hover:bg-[#3fc7a0] text-[#00382a] rounded-xl font-bold transition-all text-xs border border-[#78f9cf]/20"
              >
                Deploy Host Target
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Control bar */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-[#00110d]/60 border border-white/10 text-xs font-bold text-white outline-none focus:border-[#61e3bb] transition-all cursor-pointer"
          >
            <option value="ALL">All Network Pools</option>
            <option value="KE">Kenya Network Pool</option>
            <option value="NG">Nigeria Network Pool</option>
            <option value="UK">UK Network Pool</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by label or IP address..."
            className="w-full px-4 py-2.5 pl-10 rounded-xl bg-[#00110d]/60 border border-white/10 text-white placeholder-slate-500 focus:ring-2 focus:ring-[#61e3bb]/20 focus:border-[#61e3bb] outline-none text-xs font-medium"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-medium">
            <thead className="bg-[#00110d]/40 text-[#bbcac2] font-bold border-b border-white/5 uppercase font-mono text-[10px]">
              <tr>
                <th className="p-4">Server Host</th>
                <th className="p-4">Network Target</th>
                <th className="p-4">Region Scope</th>
                <th className="p-4">Gateway Status</th>
                <th className="p-4">Health Watchdog</th>
                <th className="p-4 text-right">Server Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredRdps.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                        <Server size={14} className="text-[#61e3bb]" />
                      </div>
                      <div>
                        <span className="font-bold text-white block leading-tight">{r.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{r.id}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-mono text-slate-300">
                    {r.ip}:{r.port}
                  </td>
                  <td className="p-4">
                    <span className="text-xs font-bold text-white">{r.country} Region</span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${getStatusBadge(r.status)}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-slate-500 flex items-center gap-1.5 mt-2.5">
                    <RefreshCw size={10} className="animate-spin text-[#61e3bb]" />
                    <span>Pinged {r.lastHealthCheck}</span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => toggleStatus(r.id, 'lock')}
                        className={`p-1.5 rounded-lg border transition-all ${
                          r.status === 'ADMIN_LOCKED'
                            ? 'bg-rose-950/40 border-rose-500/30 text-rose-400'
                            : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                        }`}
                        title={r.status === 'ADMIN_LOCKED' ? 'Unlock Server' : 'Lock Server'}
                      >
                        {r.status === 'ADMIN_LOCKED' ? <Unlock size={12} /> : <Lock size={12} />}
                      </button>
                      <button
                        onClick={() => toggleStatus(r.id, 'maintenance')}
                        className={`p-1.5 rounded-lg border transition-all ${
                          r.status === 'MAINTENANCE'
                            ? 'bg-amber-950/40 border-amber-500/30 text-[#e9c349]'
                            : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                        }`}
                        title={r.status === 'MAINTENANCE' ? 'Return to Service' : 'Put in Maintenance'}
                      >
                        <Settings size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-slate-500 hover:text-red-400 hover:border-red-500/20 transition-all"
                        title="Decommission Server"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
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
