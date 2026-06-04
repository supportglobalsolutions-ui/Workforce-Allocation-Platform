'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { 
  BarChart3, Globe, ShieldAlert, Award, TrendingUp, DollarSign,
  Users, CheckCircle2, ChevronRight, Activity, AlertTriangle
} from 'lucide-react';

interface RiskSignal {
  id: string;
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  desc: string;
  time: string;
}

const initialRiskSignals: RiskSignal[] = [
  { id: 'R-098', type: 'Unclaimed Shift', severity: 'MEDIUM', desc: 'Sarah Jenkins missed shift claim window for RDP-07', time: '2 hours ago' },
  { id: 'R-095', type: 'Excessive Idle Session', severity: 'HIGH', desc: 'Jane Doe idle on RDP-02 for 35m (Auto-Released)', time: '4 hours ago' },
  { id: 'R-091', type: 'Network Drop', severity: 'HIGH', desc: 'RDP-08 ping drop detected by Health Daemon', time: '10 hours ago' },
];

export default function LeadershipDashboard() {
  const [signals, setSignals] = useState<RiskSignal[]>(initialRiskSignals);

  return (
    <DashboardLayout role="leadership">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight leading-none">C-Suite Command Console</h2>
          <p className="text-[#bbcac2] mt-2 text-sm font-sans">Business intelligence reporting, organizational indicators, and exception risks.</p>
        </div>
      </header>

      {/* Primary KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPIBlock title="Total OPEX (May)" value="$14,240" sub="+12.4% vs last period" color="text-white" icon={<DollarSign size={20} className="text-slate-400" />} />
        <KPIBlock title="Global Uptime Rate" value="98.15%" sub="Port 3389 health index" color="text-[#61e3bb]" icon={<Activity size={20} className="text-[#61e3bb]" />} />
        <KPIBlock title="Generalists Online" value="42 / 49" sub="85% capacity utilization" color="text-[#9ddac0]" icon={<Users size={20} className="text-[#9ddac0]" />} />
        <KPIBlock title="Mean Quality Index" value="83.2%" sub="Weighted MCQ & Audits score" color="text-[#e9c349]" icon={<Award size={20} className="text-[#e9c349]" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* Core Narrative Analytics block */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider leading-none">Organizational Narratives</h3>
            <p className="text-[#bbcac2] text-[11px] mt-1 font-sans">"What does the data tell us?" executive insights summary.</p>
          </div>

          <div className="space-y-4">
            <NarrativeRow 
              title="Regional Bottlenecks" 
              desc="Nigeria network pool (NG) shows a 4.2% higher latency index compared to Kenya (KE). This correlates with higher worker idle alerts on RDP-02 and RDP-05."
              impact="Action Required: Route NG traffic through secondary proxy gateways."
              severity="medium"
            />
            <NarrativeRow 
              title="Quality Scoring Divergence" 
              desc="Rolling subjective communications scores average 4.8★ for Tier 1, while MCQ theoretical knowledge tests score 82%. This suggests training is solid, but communication parameters require optimization."
              impact="Insight: Align training MCQ scope to daily chat communications guidelines."
              severity="info"
            />
            <NarrativeRow 
              title="Capacity Leaks" 
              desc="Unclaimed RDP shift hours accounted for $340 in idle infrastructure costs this period. Attendance rate drop for Suspended workers remains primary driver."
              impact="Risk mitigation: Configure automated availability fallback lists."
              severity="high"
            />
          </div>
        </div>

        {/* Risk Signal Alert Center */}
        <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider leading-none">Real-Time Risk Signal Logs</h3>
            <p className="text-[#bbcac2] text-[11px] mt-1 font-sans">Immediate exceptions flagged in the operational stream.</p>
          </div>

          <div className="space-y-3.5">
            {signals.map(s => (
              <div key={s.id} className="p-3.5 bg-white/[0.01] border border-white/5 rounded-xl hover:bg-white/[0.02] transition-all flex items-start gap-3">
                <ShieldAlert size={16} className={`shrink-0 mt-0.5 ${s.severity === 'HIGH' ? 'text-red-400' : 'text-[#e9c349]'}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-white leading-none">{s.type}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${s.severity === 'HIGH' ? 'bg-red-950/40 text-red-400' : 'bg-amber-950/40 text-[#e9c349]'}`}>
                      {s.severity}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#bbcac2] leading-relaxed mt-1.5">{s.desc}</p>
                  <span className="text-[9px] text-slate-500 font-mono block mt-1">{s.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Regional Metrics Table */}
      <section className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-[#00110d]/40">
          <h3 className="text-sm font-bold text-white leading-none">Regional Performance Pools</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-medium">
            <thead className="bg-white/[0.01] text-[#bbcac2] font-bold border-b border-white/5 uppercase font-mono text-[10px]">
              <tr>
                <th className="p-4">Region Pool</th>
                <th className="p-4">Staff Enrolled</th>
                <th className="p-4">Active Capacity</th>
                <th className="p-4">Total Period Hours</th>
                <th className="p-4">Uptime index</th>
                <th className="p-4 text-right">Compensation gross</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <RegionRow region="Nairobi, Kenya (KE)" staff={24} active={21} hours="1,240.5" uptime="99.4%" cost="$6,240" />
              <RegionRow region="Lagos, Nigeria (NG)" staff={18} active={15} hours="840.2" uptime="96.2%" cost="$3,950" />
              <RegionRow region="London, United Kingdom (UK)" staff={7} active={6} hours="412.0" uptime="98.8%" cost="$4,050" />
            </tbody>
          </table>
        </div>
      </section>

    </DashboardLayout>
  );
}

function KPIBlock({ title, value, sub, color = 'text-white', icon }: { title: string, value: string, sub: string, color?: string, icon?: React.ReactNode }) {
  return (
    <div className="glass-panel p-5 rounded-2xl border border-white/5 flex items-center justify-between hover:border-white/10 transition-all duration-300">
      <div>
        <span className="text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider block leading-none">{title}</span>
        <span className={`text-2xl font-black mt-2 block leading-none font-sans ${color}`}>{value}</span>
        <span className="text-[10px] text-slate-500 font-medium block mt-1.5 leading-snug">{sub}</span>
      </div>
      <div className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center shadow-inner">
        {icon}
      </div>
    </div>
  );
}

function NarrativeRow({ title, desc, impact, severity }: { title: string, desc: string, impact: string, severity: 'high' | 'medium' | 'info' }) {
  const getBadgeColor = () => {
    if (severity === 'high') return 'bg-red-950/40 text-red-400 border-red-500/20';
    if (severity === 'medium') return 'bg-amber-950/40 text-amber-400 border-amber-500/20';
    return 'bg-[#61e3bb]/5 text-[#61e3bb] border-[#61e3bb]/20';
  };

  return (
    <div className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl space-y-2 hover:border-[#61e3bb]/15 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-white block">{title}</span>
        <span className={`px-2 py-0.5 rounded text-[8px] font-bold border uppercase ${getBadgeColor()}`}>
          {severity} Priority
        </span>
      </div>
      <p className="text-xs text-[#bbcac2] leading-relaxed font-sans">{desc}</p>
      <div className="text-[10px] text-slate-400 font-bold font-mono">
        ↪ {impact}
      </div>
    </div>
  );
}

function RegionRow({ region, staff, active, hours, uptime, cost }: { region: string, staff: number, active: number, hours: string, uptime: string, cost: string }) {
  return (
    <tr className="hover:bg-white/[0.01] transition-colors">
      <td className="p-4 font-bold text-white">{region}</td>
      <td className="p-4 font-mono text-slate-300">{staff} Enrolled</td>
      <td className="p-4 font-mono text-[#61e3bb]">{active} Active</td>
      <td className="p-4 font-mono text-slate-300">{hours} hrs</td>
      <td className="p-4 font-mono text-slate-400">{uptime}</td>
      <td className="p-4 font-mono text-[#e9c349] font-bold text-right">{cost}</td>
    </tr>
  );
}
