'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Monitor, Calendar, Trophy, AlertTriangle, Clock, 
  Terminal, ShieldCheck, Play, Power, HelpCircle, FileText, Send
} from 'lucide-react';

export default function WorkerPortal() {
  const [isClaimed, setIsClaimed] = useState(false);
  const [sessionTime, setSessionTime] = useState(0); // in seconds
  const [heartbeatActive, setHeartbeatActive] = useState(false);
  const [isTicketingOpen, setIsTicketingOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketSuccess, setTicketSuccess] = useState(false);

  // Timer simulation for active session
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isClaimed) {
      setHeartbeatActive(true);
      interval = setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);
    } else {
      setSessionTime(0);
      setHeartbeatActive(false);
    }
    return () => clearInterval(interval);
  }, [isClaimed]);

  const handleClaim = () => {
    setIsClaimed(true);
  };

  const handleRelease = () => {
    setIsClaimed(false);
  };

  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject || !ticketDescription) return;
    
    setTicketSuccess(true);
    setTicketSubject('');
    setTicketDescription('');
    setTimeout(() => {
      setTicketSuccess(false);
      setIsTicketingOpen(false);
    }, 3000);
  };

  const formatTime = (secs: number) => {
    const hrs = Math.floor(secs / 3600).toString().padStart(2, '0');
    const mins = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const scs = (secs % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${scs}`;
  };

  return (
    <DashboardLayout role="worker">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight leading-none">Worker Console</h2>
          <p className="text-[#bbcac2] mt-2 text-sm font-sans">Claim allocated hosts, review shift schedule blocks, and track active compliance stats.</p>
        </div>

        {isClaimed && (
          <div className="glass-panel px-5 py-3 rounded-2xl flex items-center gap-4 border-[#61e3bb]/30 bg-[#61e3bb]/5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#61e3bb] animate-pulse" />
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Claim Active</span>
              <span className="text-lg font-mono font-bold text-white leading-none block mt-0.5">{formatTime(sessionTime)}</span>
            </div>
          </div>
        )}
      </header>

      {/* Main Console Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* Active Shift Card / Guacamole Simulation */}
        <div className="lg:col-span-2 space-y-6">
          <AnimatePresence mode="wait">
            {!isClaimed ? (
              <motion.div 
                key="unclaimed"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="glass-panel p-8 rounded-3xl border border-white/5 relative overflow-hidden flex flex-col justify-between h-72"
              >
                <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-[#61e3bb]/[0.02] blur-[40px] pointer-events-none" />
                
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/20 text-[#61e3bb] text-[10px] font-bold uppercase tracking-wider font-mono mb-4">
                    Active Shift Allocation Found
                  </div>
                  <h3 className="text-2xl font-black text-white tracking-tight">Shift Block: 14:00 - 18:00</h3>
                  <p className="text-[#bbcac2] text-sm mt-2">Target Host: <span className="font-mono text-white font-bold bg-white/5 px-2 py-0.5 rounded">RDP-01-PROD</span> (KE Region pool)</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-white/5 pt-6 mt-4">
                  <div className="text-slate-500 text-xs italic font-medium">
                    * Gateway sessions are audited. System logs auto-commit every 60 seconds.
                  </div>
                  <button 
                    onClick={handleClaim}
                    className="w-full sm:w-auto px-8 py-3.5 bg-[#61e3bb] hover:bg-[#3fc7a0] text-[#00382a] rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(97,227,187,0.15)] flex items-center justify-center gap-2 border border-[#78f9cf]/20 text-xs uppercase tracking-wider font-sans"
                  >
                    <Play size={14} />
                    <span>Claim Assigned Host</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="claimed"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="glass-panel rounded-3xl border border-[#61e3bb]/20 overflow-hidden flex flex-col justify-between h-[450px]"
              >
                {/* RDP Header / Bar */}
                <div className="bg-[#00110d] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Terminal size={16} className="text-[#61e3bb] animate-pulse" />
                    <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">Apache Guacamole Secure Tunnel Client</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {heartbeatActive && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-[#61e3bb] bg-[#61e3bb]/5 border border-[#61e3bb]/20 px-2 py-0.5 rounded">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#61e3bb] animate-ping" />
                        HEARTBEAT OK
                      </span>
                    )}
                    <button
                      onClick={handleRelease}
                      className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase rounded-lg transition-all"
                    >
                      Release RDP
                    </button>
                  </div>
                </div>

                {/* Simulated RDP Display Area */}
                <div className="flex-1 bg-black p-6 font-mono text-xs overflow-y-auto flex flex-col justify-between relative select-none">
                  {/* Grid background effect */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#0c0c0c_1px,transparent_1px),linear-gradient(to_bottom,#0c0c0c_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-20" />
                  
                  <div className="space-y-2 text-[#61e3bb] relative z-10">
                    <p className="text-slate-400">// Connecting to 10.0.1.15:3389 via Guacamole daemon...</p>
                    <p className="text-slate-400">// Initialising credential vault protocol (secure-scoped token)...</p>
                    <p className="text-white">✓ Handshake successful. RDP layer initialised.</p>
                    <p className="text-white">✓ Session audit ID: S-2098 committed to PostgreSQL.</p>
                    <p className="text-[#e9c349] mt-4 font-bold">// Active generalist instructions loaded:</p>
                    <p className="text-slate-300">1. Navigate to the assigned Third-party platform dashboard</p>
                    <p className="text-slate-300">2. Execute scheduled data evaluation checks</p>
                    <p className="text-slate-300">3. Log task guidelines anomalies immediately in issue portal</p>
                  </div>

                  <div className="border border-white/10 rounded-lg p-4 bg-[#050505]/80 relative z-10 max-w-sm mt-8">
                    <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider mb-2">Simulation Sandbox Control</span>
                    <p className="text-[10px] text-[#bbcac2] leading-relaxed mb-3">You are logged into Nairobi target node RDP-01. Click 'Release' above once shift is completed.</p>
                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-[#61e3bb] h-full animate-[pulse_2s_infinite]" style={{ width: '70%' }} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Worker statistics */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-white/5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 pb-2 border-b border-white/5 flex items-center justify-between">
              <span>My KPI Console Dashboard</span>
              <Trophy size={14} className="text-[#e9c349]" />
            </h3>
            
            <div className="space-y-4">
              <StatRow label="Composite Quality Index" value="92 / 100" desc="Rolling average from MCQ & Admin audits" highlightColor="text-[#61e3bb]" />
              <StatRow label="Global Rank Index" value="#4 / 49" desc="Position within international workforce" highlightColor="text-[#e9c349]" />
              <StatRow label="Hours Accumulated" value="245.5 hrs" desc="Approved session durations this period" />
              <StatRow label="Session Reliability" value="98.2%" desc="Ratio of shift claims completed" />
            </div>
          </div>

          {/* Quick Issue submission */}
          <div className="glass-panel p-6 rounded-3xl border border-white/5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 pb-2 border-b border-white/5 flex items-center justify-between">
              <span>Issue Triage Portal</span>
              <AlertTriangle size={14} className="text-red-400" />
            </h3>
            <p className="text-[10px] text-slate-400 leading-relaxed mb-4">
              Encountering machine errors or platform task guide discrepancies? Submit a timestamped ticket to route directly to active operations leads.
            </p>
            
            {!isTicketingOpen ? (
              <button
                onClick={() => setIsTicketingOpen(true)}
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all text-xs border border-white/10"
              >
                File Triage Ticket
              </button>
            ) : (
              <form onSubmit={handleSubmitTicket} className="space-y-3">
                {ticketSuccess && (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-500/20 text-[#61e3bb] rounded-xl text-[10px] font-bold">
                    ✓ Ticket successfully filed. Operations lead notified.
                  </div>
                )}
                <div>
                  <input
                    type="text"
                    required
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    placeholder="Short summary (e.g., RDP-01 latency)"
                    className="w-full px-3 py-2 bg-[#00110d] border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:border-[#61e3bb] outline-none transition-all"
                  />
                </div>
                <div>
                  <textarea
                    required
                    value={ticketDescription}
                    onChange={(e) => setTicketDescription(e.target.value)}
                    placeholder="Detail the issue encountered..."
                    className="w-full px-3 py-2 bg-[#00110d] border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:border-[#61e3bb] outline-none transition-all h-20 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTicketingOpen(false)}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-500/20 text-red-400 rounded-xl text-xs font-bold transition-all"
                  >
                    File Ticket
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatRow({ 
  label, 
  value, 
  desc, 
  highlightColor = 'text-white' 
}: { 
  label: string, 
  value: string, 
  desc?: string, 
  highlightColor?: string 
}) {
  return (
    <div className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <div className="flex justify-between items-baseline">
        <span className="text-xs font-bold text-slate-400">{label}</span>
        <span className={`text-base font-black font-mono ${highlightColor}`}>{value}</span>
      </div>
      {desc && <span className="text-[9px] text-slate-500 font-medium block mt-1 leading-snug">{desc}</span>}
    </div>
  );
}
