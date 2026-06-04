'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Search, Filter, MoreVertical, ExternalLink, Globe, 
  Award, Clock, Calendar, CheckCircle2, AlertCircle, X, ChevronRight,
  TrendingUp, ThumbsUp, Send
} from 'lucide-react';

interface QualityRating {
  score: number;
  ratedBy: string;
  reason: string;
  createdAt: string;
}

interface SessionRecord {
  id: string;
  rdpName: string;
  startTime: string;
  duration: number; // minutes
  status: 'Completed' | 'Idle Auto-Release' | 'Under Review';
}

interface Worker {
  id: string;
  name: string;
  email: string;
  country: 'KE' | 'UK' | 'NG';
  role: 'Generalist' | 'Team Lead' | 'Country Manager' | 'Operations Lead';
  payTier: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Leadership';
  hourlyRate: number;
  currency: 'USD' | 'GBP' | 'KES' | 'NGN';
  status: 'Active' | 'Suspended' | 'Inactive';
  qualityScore: number; // composite 1-100
  mcqScore: number; // MCQ Assessment score
  communicationScore: number; // 1-5 rating
  totalHours: number;
  ratings: QualityRating[];
  sessions: SessionRecord[];
}

const initialWorkers: Worker[] = [
  { 
    id: 'W-001', 
    name: 'Kibiru Kelvin', 
    email: 'k.kelvin@globalsolutions.com',
    country: 'KE', 
    role: 'Generalist',
    payTier: 'Tier 1', 
    hourlyRate: 15.00,
    currency: 'USD',
    status: 'Active',
    qualityScore: 92,
    mcqScore: 90,
    communicationScore: 4.8,
    totalHours: 245.5,
    ratings: [
      { score: 5, ratedBy: 'Admin Lead', reason: 'Exceptional shift coverage and reliable communications.', createdAt: '2026-05-28' },
      { score: 4, ratedBy: 'Country Manager', reason: 'Performed well in training assessment.', createdAt: '2026-05-15' }
    ],
    sessions: [
      { id: 'S-2098', rdpName: 'RDP-01-PROD', startTime: '2026-06-03 08:00', duration: 240, status: 'Completed' },
      { id: 'S-2041', rdpName: 'RDP-04-PROD', startTime: '2026-06-02 12:00', duration: 180, status: 'Completed' }
    ]
  },
  { 
    id: 'W-045', 
    name: 'Jane Doe', 
    email: 'j.doe@globalsolutions.com',
    country: 'NG', 
    role: 'Generalist',
    payTier: 'Tier 2', 
    hourlyRate: 12.50,
    currency: 'USD',
    status: 'Active',
    qualityScore: 78,
    mcqScore: 82,
    communicationScore: 3.5,
    totalHours: 180.2,
    ratings: [
      { score: 3, ratedBy: 'Admin Lead', reason: 'Session marked idle twice this week. Needs follow up.', createdAt: '2026-06-01' }
    ],
    sessions: [
      { id: 'S-2099', rdpName: 'RDP-02-PROD', startTime: '2026-06-03 09:00', duration: 320, status: 'Idle Auto-Release' },
      { id: 'S-1987', rdpName: 'RDP-05-FREE', startTime: '2026-05-30 14:00', duration: 150, status: 'Completed' }
    ]
  },
  { 
    id: 'W-002', 
    name: 'Luther Rukhairo', 
    email: 'luther.ceo@globalsolutions.com',
    country: 'UK', 
    role: 'Operations Lead',
    payTier: 'Leadership', 
    hourlyRate: 50.00,
    currency: 'GBP',
    status: 'Active',
    qualityScore: 98,
    mcqScore: 96,
    communicationScore: 5.0,
    totalHours: 12.0,
    ratings: [],
    sessions: []
  },
  { 
    id: 'W-088', 
    name: 'Sarah Jenkins', 
    email: 's.jenkins@globalsolutions.com',
    country: 'UK', 
    role: 'Generalist',
    payTier: 'Tier 1', 
    hourlyRate: 20.00,
    currency: 'USD',
    status: 'Suspended',
    qualityScore: 65,
    mcqScore: 70,
    communicationScore: 2.0,
    totalHours: 94.0,
    ratings: [
      { score: 2, ratedBy: 'Operations Lead', reason: 'Unexcused absence for assigned shift window.', createdAt: '2026-05-24' }
    ],
    sessions: [
      { id: 'S-1845', rdpName: 'RDP-07-PROD', startTime: '2026-05-23 10:00', duration: 42, status: 'Under Review' }
    ]
  }
];

export default function WorkerManagement() {
  const [workers, setWorkers] = useState<Worker[]>(initialWorkers);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  
  // Rating Inputs
  const [newScore, setNewScore] = useState<number>(5);
  const [newReason, setNewReason] = useState<string>('');

  const handleAddRating = (workerId: string) => {
    if (!newReason.trim()) return;

    setWorkers(prev => prev.map(w => {
      if (w.id === workerId) {
        const newRating: QualityRating = {
          score: newScore,
          ratedBy: 'Admin Lead',
          reason: newReason,
          createdAt: new Date().toISOString().split('T')[0]
        };
        const updatedRatings = [newRating, ...w.ratings];
        
        // Recalculate communication rating average
        const totalRatingScore = updatedRatings.reduce((sum, r) => sum + r.score, 0);
        const avgComm = parseFloat((totalRatingScore / updatedRatings.length).toFixed(1));
        
        // Composite quality score: 50% MCQ + 50% communication average (out of 100, which is comm * 20)
        const updatedQuality = Math.round((w.mcqScore + (avgComm * 20)) / 2);

        const updatedWorker = {
          ...w,
          ratings: updatedRatings,
          communicationScore: avgComm,
          qualityScore: updatedQuality
        };

        // Update active modal view immediately
        setSelectedWorker(updatedWorker);
        return updatedWorker;
      }
      return w;
    }));

    setNewReason('');
    setNewScore(5);
  };

  const filteredWorkers = workers.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase()) || 
                          w.id.toLowerCase().includes(search.toLowerCase()) ||
                          w.email.toLowerCase().includes(search.toLowerCase());
    const matchesCountry = countryFilter === 'ALL' || w.country === countryFilter;
    return matchesSearch && matchesCountry;
  });

  return (
    <DashboardLayout>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight leading-none">Worker Database</h2>
          <p className="text-[#bbcac2] mt-2 text-sm">Review credentials, compensation structures, and live audit metrics scoped by country.</p>
        </div>
        <button className="bg-[#61e3bb] hover:bg-[#3fc7a0] text-[#00382a] px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(97,227,187,0.1)]">
          <Plus size={16} />
          <span>Register Worker</span>
        </button>
      </header>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="glass-panel p-5 rounded-2xl border border-white/5">
          <span className="text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider block">Total Enrolled</span>
          <span className="text-2xl font-black text-white mt-1.5 block leading-none">49 Workers</span>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-white/5">
          <span className="text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider block">Active Status</span>
          <span className="text-2xl font-black text-[#61e3bb] mt-1.5 block leading-none">42 Active</span>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-white/5">
          <span className="text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider block">Suspended Escrow</span>
          <span className="text-2xl font-black text-red-400 mt-1.5 block leading-none">3 Suspended</span>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-white/5">
          <span className="text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider block">Average Quality</span>
          <span className="text-2xl font-black text-[#e9c349] mt-1.5 block leading-none">83.2 / 100</span>
        </div>
      </div>

      {/* Control bar */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Country filter */}
          <div className="relative">
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-[#00110d]/60 border border-white/10 text-xs font-bold text-white outline-none focus:border-[#61e3bb] transition-all cursor-pointer appearance-none pr-8"
            >
              <option value="ALL">All Regions</option>
              <option value="KE">Kenya (KE)</option>
              <option value="NG">Nigeria (NG)</option>
              <option value="UK">United Kingdom (UK)</option>
            </select>
            <Globe className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={12} />
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID or email..."
            className="w-full px-4 py-2.5 pl-10 rounded-xl bg-[#00110d]/60 border border-white/10 text-white placeholder-slate-500 focus:ring-2 focus:ring-[#61e3bb]/20 focus:border-[#61e3bb] outline-none text-xs font-medium"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
        </div>
      </div>

      {/* High-Fidelity Table */}
      <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-medium">
            <thead className="bg-[#00110d]/40 text-[#bbcac2] font-bold border-b border-white/5 uppercase font-mono text-[10px]">
              <tr>
                <th className="p-4">Personnel ID</th>
                <th className="p-4">Staff Member</th>
                <th className="p-4">Scope Role</th>
                <th className="p-4">Pay Tier & Rate</th>
                <th className="p-4">Quality Index</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Records</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredWorkers.map((w) => (
                <tr 
                  key={w.id} 
                  className="hover:bg-[#0a4d3a]/25 transition-all duration-150 cursor-pointer group"
                  onClick={() => setSelectedWorker(w)}
                >
                  <td className="p-4 font-mono text-slate-400 group-hover:text-white transition-colors">{w.id}</td>
                  <td className="p-4">
                    <div>
                      <span className="font-bold text-white block leading-tight">{w.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{w.email}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-slate-300 font-bold">{w.role}</span>
                  </td>
                  <td className="p-4">
                    <div>
                      <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-white rounded text-[10px] font-bold font-mono">
                        {w.payTier}
                      </span>
                      <span className="text-[#e9c349] font-bold font-mono block mt-1">
                        {w.hourlyRate.toFixed(2)} {w.currency}/hr
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-10 bg-white/5 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            w.qualityScore >= 90 ? 'bg-[#61e3bb]' : w.qualityScore >= 75 ? 'bg-[#e9c349]' : 'bg-red-400'
                          }`}
                          style={{ width: `${w.qualityScore}%` }}
                        />
                      </div>
                      <span className="font-bold text-white font-mono">{w.qualityScore}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border ${
                      w.status === 'Active' 
                        ? 'bg-emerald-950/40 text-[#61e3bb] border-emerald-500/20' 
                        : w.status === 'Suspended'
                          ? 'bg-red-950/40 text-red-400 border-red-500/20'
                          : 'bg-slate-900/60 text-slate-400 border-slate-700/25'
                    }`}>
                      {w.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-[#61e3bb] hover:bg-[#61e3bb]/10 hover:border-[#61e3bb]/30 transition-all">
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Overlay Drawer Modal */}
      <AnimatePresence>
        {selectedWorker && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedWorker(null)}
              className="fixed inset-0 bg-[#00110d] z-50 pointer-events-auto"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-full max-w-xl bg-[#00110d] border-l border-white/10 z-50 flex flex-col shadow-2xl p-8"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-tr from-[#142f28] to-[#1f3a33] border border-white/10 rounded-2xl flex items-center justify-center font-black text-xl text-[#61e3bb]">
                    {selectedWorker.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white leading-tight">{selectedWorker.name}</h3>
                    <span className="text-xs font-mono text-slate-500 uppercase">{selectedWorker.id} • {selectedWorker.country} REGION</span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedWorker(null)}
                  className="p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-thin">
                {/* Profile Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="Compensation Struct" value={`${selectedWorker.hourlyRate.toFixed(2)} ${selectedWorker.currency}/hr`} sub={`${selectedWorker.payTier}`} />
                  <DetailField label="Accumulated Session Work" value={`${selectedWorker.totalHours} hrs`} sub="Active payroll window" />
                  <DetailField label="General Email ID" value={selectedWorker.email} sub="Primary credentials ID" />
                  <DetailField label="Organizational Role" value={selectedWorker.role} sub={`Scoped to ${selectedWorker.country}`} />
                </div>

                {/* Quality Metrics breakdown */}
                <div className="glass-panel p-5 rounded-2xl border border-white/5">
                  <h4 className="text-xs font-bold text-[#bbcac2] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Award size={14} className="text-[#e9c349]" />
                    <span>Quality Scoring Engine (Composite: {selectedWorker.qualityScore})</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl text-center">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">MCQ Assessment Score (50%)</span>
                      <span className="text-2xl font-black text-white block mt-2 font-mono">{selectedWorker.mcqScore}%</span>
                    </div>
                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl text-center">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Communication Rating (50%)</span>
                      <span className="text-2xl font-black text-[#61e3bb] block mt-2 font-mono">{selectedWorker.communicationScore} / 5</span>
                    </div>
                  </div>
                </div>

                {/* Admin rating input */}
                <div className="glass-panel p-5 rounded-2xl border border-white/5">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Add Quality Assessment Audit</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-1.5">Communication Rating Score</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setNewScore(num)}
                            className={`flex-1 py-2 rounded-lg font-bold border transition-all text-xs ${
                              newScore === num 
                                ? 'bg-[#142f28] border-[#61e3bb]/40 text-[#61e3bb] shadow-sm' 
                                : 'bg-[#00110d] border-white/5 text-slate-400 hover:text-white'
                            }`}
                          >
                            {num} ★
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-1.5">Assessment Reasoning Note (Mandatory)</label>
                      <textarea
                        value={newReason}
                        required
                        onChange={(e) => setNewReason(e.target.value)}
                        placeholder="Detail reasoning for scoring adjustment..."
                        className="w-full px-4 py-2.5 text-xs bg-[#00110d] border border-white/10 rounded-xl text-white placeholder-slate-600 focus:border-[#61e3bb] outline-none transition-all h-20 resize-none font-sans"
                      />
                    </div>
                    <button
                      onClick={() => handleAddRating(selectedWorker.id)}
                      className="w-full py-3 bg-[#61e3bb] hover:bg-[#3fc7a0] text-[#00382a] rounded-xl font-bold transition-all text-xs flex items-center justify-center gap-1.5 border border-[#78f9cf]/20"
                    >
                      <Send size={12} />
                      <span>Commit Scoring Assessment</span>
                    </button>
                  </div>
                </div>

                {/* Rating history logs */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Assessment Audit Trail</h4>
                  {selectedWorker.ratings.length === 0 ? (
                    <div className="text-slate-500 text-xs italic p-4 bg-white/[0.01] border border-white/5 rounded-xl">
                      No prior subjective ratings committed.
                    </div>
                  ) : (
                    selectedWorker.ratings.map((r, idx) => (
                      <div key={idx} className="bg-white/[0.02] border border-white/5 p-4 rounded-xl relative">
                        <span className="absolute top-4 right-4 px-2 py-0.5 bg-[#142f28] border border-[#61e3bb]/20 text-[#61e3bb] rounded text-[9px] font-bold">
                          {r.score} Star Rating
                        </span>
                        <p className="text-xs font-bold text-white">{r.ratedBy}</p>
                        <p className="text-slate-500 text-[10px] font-mono mt-0.5">{r.createdAt}</p>
                        <p className="text-xs text-[#bbcac2] leading-relaxed mt-2 italic">"{r.reason}"</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Session lists */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Recent RDP Claim Logs</h4>
                  {selectedWorker.sessions.length === 0 ? (
                    <div className="text-slate-500 text-xs italic p-4 bg-white/[0.01] border border-white/5 rounded-xl">
                      No active sessions logs in storage database.
                    </div>
                  ) : (
                    selectedWorker.sessions.map((s, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3.5 bg-white/[0.01] border border-white/5 rounded-xl hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#142f28]/40 flex items-center justify-center">
                            <Clock size={14} className="text-[#9ddac0]" />
                          </div>
                          <div>
                            <span className="font-bold text-white block text-xs leading-none">{s.rdpName}</span>
                            <span className="text-[10px] text-slate-500 font-mono block mt-1">{s.startTime}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-white block font-mono leading-none">{s.duration} min</span>
                          <span className={`text-[9px] font-bold block mt-1 uppercase font-sans ${
                            s.status === 'Completed' ? 'text-[#61e3bb]' : s.status === 'Under Review' ? 'text-[#e9c349]' : 'text-red-400'
                          }`}>
                            {s.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

function DetailField({ label, value, sub }: { label: string, value: string, sub?: string }) {
  return (
    <div className="bg-[#00110d] border border-white/5 rounded-xl p-4">
      <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider leading-none">{label}</span>
      <span className="text-sm font-black text-white block mt-2 leading-none font-sans">{value}</span>
      {sub && <span className="text-[10px] text-slate-400 font-medium block mt-1.5 leading-snug">{sub}</span>}
    </div>
  );
}
