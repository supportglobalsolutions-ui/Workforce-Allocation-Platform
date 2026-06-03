'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { motion } from 'framer-motion';
import { Plus, Search, Filter, MoreVertical, ExternalLink } from 'lucide-react';

export default function WorkerManagement() {
  return (
    <DashboardLayout>
      <header className="flex justify-between items-end mb-10">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Worker Management</h2>
          <p className="text-slate-500 mt-1">Manage personnel, pay tiers, and compliance active across 3 countries.</p>
        </div>
        <button className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition shadow-lg shadow-indigo-100">
          <Plus size={20} />
          Register New Worker
        </button>
      </header>

      {/* Filters & Actions Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between mb-8">
        <div className="flex items-center gap-4 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by name, ID or country..."
              className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium"
            />
          </div>
          <button className="p-2.5 rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 transition">
            <Filter size={18} />
          </button>
        </div>
        
        <div className="flex gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2 py-2">Quick Stats:</span>
          <QuickStat label="Active" count={42} color="bg-emerald-500" />
          <QuickStat label="Suspended" count={3} color="bg-rose-500" />
        </div>
      </div>

      {/* Grid of Workers */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <WorkerCard name="Kibiru Kelvin" id="W-001" country="KE" status="Active" tier="Tier 1" />
        <WorkerCard name="Luther Rukhairo" id="W-002" country="UK" status="Active" tier="Leadership" />
        <WorkerCard name="Jane Doe" id="W-045" country="NG" status="Active" tier="Tier 2" />
      </div>
    </DashboardLayout>
  );
}

function QuickStat({ label, count, color }: { label: string, count: number, color: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 italic">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs font-bold text-slate-600">{count} {label}</span>
    </div>
  );
}

function WorkerCard({ name, id, country, status, tier }: { name: string, id: string, country: string, status: string, tier: string }) {
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all"
    >
      <div className="flex justify-between items-start mb-6">
        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center font-black text-indigo-600 border border-slate-100">
          {name.split(' ').map(n => n[0]).join('')}
        </div>
        <button className="text-slate-300 hover:text-slate-600 p-1">
          <MoreVertical size={20} />
        </button>
      </div>
      
      <div>
        <h3 className="text-lg font-black text-slate-900">{name}</h3>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{id} • {country}</p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold">{tier}</span>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold">{status}</span>
        </div>
        <button className="text-indigo-600 flex items-center gap-1 text-xs font-bold hover:underline">
          View Profile <ExternalLink size={12} />
        </button>
      </div>
    </motion.div>
  );
}
