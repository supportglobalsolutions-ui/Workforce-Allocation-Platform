'use client';

import { motion } from 'framer-motion';
import { 
  Monitor, 
  Calendar, 
  Trophy, 
  History, 
  AlertCircle,
  Clock
} from 'lucide-react';

export default function WorkerPortal() {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar - Simple for MVP */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden lg:flex flex-col p-6">
        <h2 className="text-xl font-black text-indigo-900 mb-10">GBS Worker</h2>
        <nav className="space-y-2">
          <NavItem icon={<Monitor size={20} />} label="RDP Claim Board" active />
          <NavItem icon={<Calendar size={20} />} label="My Schedule" />
          <NavItem icon={<Trophy size={20} />} label="Leaderboard" />
          <NavItem icon={<History size={20} />} label="Session History" />
          <NavItem icon={<AlertCircle size={20} />} label="Issue Ticketing" />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Worker Portal</h1>
            <p className="text-slate-500">Welcome back, Kibiru Kelvin</p>
          </div>
          <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
            <Clock className="text-indigo-600" size={24} />
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Session Time</p>
              <p className="text-lg font-mono font-bold text-slate-800">04:22:15</p>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Active Shift Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:col-span-2 bg-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200"
          >
            <h2 className="text-xl font-bold mb-6">Active Shift Window</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-indigo-100 mb-1">Assigned Machine</p>
                <p className="text-3xl font-black">RDP-07 (Nairobi)</p>
              </div>
              <button className="px-10 py-4 bg-white text-indigo-600 rounded-2xl font-black hover:bg-slate-50 transition shadow-lg">
                Claim RDP
              </button>
            </div>
          </motion.div>

          {/* Quick Stats */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm"
          >
            <h2 className="text-xl font-bold text-slate-800 mb-6">Stats Summary</h2>
            <div className="space-y-6">
              <StatRow label="Quality Score" value="98.4%" />
              <StatRow label="Global Rank" value="#4" />
              <StatRow label="Hours (May)" value="162.5" />
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition cursor-pointer ${
      active ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
    }`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between items-center border-b border-slate-50 pb-4">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className="text-slate-900 font-black">{value}</span>
    </div>
  );
}
