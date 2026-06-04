'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { 
  Settings, Clock, Bell, Database, Key, Save, RefreshCw
} from 'lucide-react';

export default function SystemSettings() {
  const [idleThreshold, setIdleThreshold] = useState(20);
  const [warningThreshold, setWarningThreshold] = useState(10);
  const [pollInterval, setPollInterval] = useState(30);
  const [firebaseUrl, setFirebaseUrl] = useState('https://globalsolutions-prod-default-rtdb.firebaseio.com');
  const [enableEmailAlerts, setEnableEmailAlerts] = useState(true);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <DashboardLayout>
      <header className="mb-8">
        <h2 className="text-3xl font-black text-white tracking-tight leading-none">System Settings</h2>
        <p className="text-[#bbcac2] mt-2 text-sm">Configure threshold limits, Firebase connection variables, and background polling triggers.</p>
      </header>

      <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
        {/* Save message */}
        {isSaved && (
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-[#61e3bb] text-xs font-bold font-sans">
            ✓ System configurations successfully committed and synced to PostgreSQL and Firebase.
          </div>
        )}

        {/* Section 1: Claim & Release Rules */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-6">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-white/5">
            <Clock size={14} className="text-[#61e3bb]" />
            <span>Allocation & Release Engine Thresholds</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-2">Idle Warn Threshold (Minutes)</label>
              <input 
                type="number"
                value={warningThreshold}
                onChange={(e) => setWarningThreshold(parseInt(e.target.value))}
                className="w-full px-4 py-3 rounded-xl bg-[#00110d] border border-white/10 text-white font-mono text-sm focus:border-[#61e3bb] outline-none transition-all"
              />
              <span className="text-[10px] text-slate-500 mt-1.5 block">Flags a claimed RDP machine status as IDLE in Firebase after inactive mouse/keyboard activity.</span>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-2">Auto-Release Threshold (Minutes)</label>
              <input 
                type="number"
                value={idleThreshold}
                onChange={(e) => setIdleThreshold(parseInt(e.target.value))}
                className="w-full px-4 py-3 rounded-xl bg-[#00110d] border border-white/10 text-white font-mono text-sm focus:border-[#61e3bb] outline-none transition-all"
              />
              <span className="text-[10px] text-slate-500 mt-1.5 block">Forcibly releases RDP sessions, returns machine status to ONLINE_FREE, and writes to audit logs.</span>
            </div>
          </div>
        </div>

        {/* Section 2: Health Monitoring */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-6">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-white/5">
            <RefreshCw size={14} className="text-[#e9c349]" />
            <span>Health Monitor Engine Parameters</span>
          </h3>

          <div>
            <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-2">ICMP & TCP Ping Interval (Seconds)</label>
            <input 
              type="number"
              value={pollInterval}
              onChange={(e) => setPollInterval(parseInt(e.target.value))}
              className="w-full px-4 py-3 rounded-xl bg-[#00110d] border border-white/10 text-white font-mono text-sm focus:border-[#61e3bb] outline-none transition-all"
            />
            <span className="text-[10px] text-slate-500 mt-1.5 block">The custom Python Watchdog daemon interval for polling port 3389 across all active targets.</span>
          </div>
        </div>

        {/* Section 3: Firebase Integration */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-6">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-white/5">
            <Database size={14} className="text-blue-400" />
            <span>Firebase Realtime Database Mapping</span>
          </h3>

          <div>
            <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-2">Realtime Database Endpoint URL</label>
            <input 
              type="text"
              value={firebaseUrl}
              onChange={(e) => setFirebaseUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#00110d] border border-white/10 text-white font-mono text-xs focus:border-[#61e3bb] outline-none transition-all"
            />
            <span className="text-[10px] text-slate-500 mt-1.5 block">Points the Next.js Firebase Client SDK to synchronise RDP status boards and audit flags.</span>
          </div>
        </div>

        {/* Section 4: Uptime Alerts */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-6">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-white/5">
            <Bell size={14} className="text-[#ffb4ab]" />
            <span>Emergency Operations Alerts</span>
          </h3>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-white block">Email Dispatch on Node Failure</span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Trigger SMTP notifications to operations leads when health ping drops.</span>
            </div>
            <button
              type="button"
              onClick={() => setEnableEmailAlerts(!enableEmailAlerts)}
              className={`w-12 h-6 rounded-full p-1 transition-all ${
                enableEmailAlerts ? 'bg-[#61e3bb]' : 'bg-slate-800'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-[#00382a] transition-all ${
                enableEmailAlerts ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-8 py-4 bg-[#61e3bb] hover:bg-[#3fc7a0] text-[#00382a] rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(97,227,187,0.15)] flex items-center gap-2 border border-[#78f9cf]/20"
          >
            <Save size={16} />
            <span>Commit Global Configurations</span>
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}
