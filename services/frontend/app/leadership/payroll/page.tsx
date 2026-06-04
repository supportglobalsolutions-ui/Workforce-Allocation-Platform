'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { 
  Landmark, CreditCard, AlertCircle, Download, FileText, 
  Settings, DollarSign, Plus, ArrowRight, User, CheckCircle
} from 'lucide-react';

interface PayrollEntry {
  workerId: string;
  name: string;
  country: 'KE' | 'UK' | 'NG';
  payTier: string;
  baseRate: number;
  hours: number;
  bonus: number;
  fines: number;
  splitPercent: number; // e.g. 70% to worker, 30% to company/partner
  exception: boolean;
  exceptionDesc?: string;
  currency: string;
}

const initialPayroll: PayrollEntry[] = [
  { workerId: 'W-001', name: 'Kibiru Kelvin', country: 'KE', payTier: 'Tier 1', baseRate: 15.00, hours: 245.5, bonus: 50.00, fines: 0, splitPercent: 100, exception: false, currency: 'USD' },
  { workerId: 'W-045', name: 'Jane Doe', country: 'NG', payTier: 'Tier 2', baseRate: 12.50, hours: 180.2, bonus: 0, fines: 25.00, splitPercent: 80, exception: true, exceptionDesc: 'Session S-2099 was idle-terminated (Auto-Release)', currency: 'USD' },
  { workerId: 'W-088', name: 'Sarah Jenkins', country: 'UK', payTier: 'Tier 1', baseRate: 20.00, hours: 94.0, bonus: 0, fines: 50.00, splitPercent: 100, exception: true, exceptionDesc: 'Unexcused shift absence on May 24', currency: 'USD' },
  { workerId: 'W-002', name: 'Luther Rukhairo', country: 'UK', payTier: 'Leadership', baseRate: 50.00, hours: 12.0, bonus: 0, fines: 0, splitPercent: 100, exception: false, currency: 'GBP' }
];

export default function PayrollBridge() {
  const [entries, setEntries] = useState<PayrollEntry[]>(initialPayroll);
  const [selectedEntry, setSelectedEntry] = useState<PayrollEntry | null>(null);
  
  // Adjustment Inputs
  const [adjustAmount, setAdjustAmount] = useState<number>(0);
  const [adjustType, setAdjustType] = useState<'bonus' | 'fine'>('bonus');
  const [adjustReason, setAdjustReason] = useState<string>('');

  const [isExporting, setIsExporting] = useState(false);
  const [payslipSent, setPayslipSent] = useState(false);

  const calculateGross = (e: PayrollEntry) => {
    const rawSalary = e.hours * e.baseRate;
    const splitSalary = rawSalary * (e.splitPercent / 100);
    return parseFloat((splitSalary + e.bonus - e.fines).toFixed(2));
  };

  const handleApplyAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry || adjustAmount <= 0 || !adjustReason.trim()) return;

    setEntries(prev => prev.map(w => {
      if (w.workerId === selectedEntry.workerId) {
        return {
          ...w,
          bonus: adjustType === 'bonus' ? w.bonus + adjustAmount : w.bonus,
          fines: adjustType === 'fine' ? w.fines + adjustAmount : w.fines
        };
      }
      return w;
    }));

    // Reset inputs
    setAdjustAmount(0);
    setAdjustReason('');
    setSelectedEntry(null);
  };

  const triggerExport = (type: 'csv' | 'pdf') => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      alert(`System download complete: globalsolutions_payroll_${type === 'csv' ? 'data.csv' : 'slips.pdf'} successfully generated.`);
    }, 2000);
  };

  const totalOpex = entries.reduce((sum, e) => sum + calculateGross(e), 0);
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const totalExceptions = entries.filter(e => e.exception).length;

  return (
    <DashboardLayout role="leadership">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight leading-none">Payroll Bridge Engine</h2>
          <p className="text-[#bbcac2] mt-2 text-sm font-sans">Verification of session hour calculations, line-item adjustments, and gross payout exports.</p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => triggerExport('csv')}
            disabled={isExporting}
            className="px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl text-xs font-bold transition-all hover:bg-white/10 flex items-center gap-1.5"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button 
            onClick={() => triggerExport('pdf')}
            disabled={isExporting}
            className="px-4 py-2.5 bg-white/5 border border-[#e9c349]/30 text-[#e9c349] rounded-xl text-xs font-bold transition-all hover:bg-[#e9c349]/5 flex items-center gap-1.5"
          >
            <FileText size={14} />
            <span>PDF Payslips</span>
          </button>
        </div>
      </header>

      {/* Summary KPI Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="glass-panel p-5 rounded-2xl border border-white/5">
          <span className="text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider block">Period Total Gross Payout</span>
          <span className="text-2xl font-black text-[#e9c349] mt-1.5 block leading-none font-mono">${totalOpex.toFixed(2)}</span>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-white/5">
          <span className="text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider block">Total Period Hours</span>
          <span className="text-2xl font-black text-white mt-1.5 block leading-none font-mono">{totalHours.toFixed(1)} hrs</span>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-white/5">
          <span className="text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider block">Unresolved Exception Alerts</span>
          <span className="text-2xl font-black text-red-400 mt-1.5 block leading-none font-mono">{totalExceptions} Exceptions</span>
        </div>
      </div>

      {/* Main Bridge list */}
      <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-medium">
            <thead className="bg-[#00110d]/40 text-[#bbcac2] font-bold border-b border-white/5 uppercase font-mono text-[10px]">
              <tr>
                <th className="p-4">Staff Member</th>
                <th className="p-4">Pay Tier</th>
                <th className="p-4">Verified Hours</th>
                <th className="p-4">Arrangement Split</th>
                <th className="p-4">Additions/Fines</th>
                <th className="p-4">Exceptions Status</th>
                <th className="p-4">Gross Payout</th>
                <th className="p-4 text-right">Adjustment Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {entries.map((e) => (
                <tr key={e.workerId} className="hover:bg-[#0a4d3a]/20 transition-colors">
                  <td className="p-4">
                    <div>
                      <span className="font-bold text-white block leading-tight">{e.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{e.workerId}</span>
                    </div>
                  </td>
                  <td className="p-4 font-bold text-slate-300">{e.payTier}</td>
                  <td className="p-4 font-mono text-white">{e.hours.toFixed(1)} hrs</td>
                  <td className="p-4 font-mono text-slate-400">
                    {e.splitPercent}% Split
                  </td>
                  <td className="p-4">
                    <div className="font-mono">
                      {e.bonus > 0 && <span className="text-[#61e3bb] block">+{e.bonus.toFixed(2)} Bonus</span>}
                      {e.fines > 0 && <span className="text-red-400 block">-{e.fines.toFixed(2)} Fine</span>}
                      {e.bonus === 0 && e.fines === 0 && <span className="text-slate-600">-</span>}
                    </div>
                  </td>
                  <td className="p-4">
                    {e.exception ? (
                      <span 
                        className="inline-flex items-center gap-1 text-red-400 border border-red-500/20 bg-red-950/20 px-2 py-0.5 rounded text-[9px] font-bold uppercase cursor-help"
                        title={e.exceptionDesc}
                      >
                        <AlertCircle size={10} />
                        Exception
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#61e3bb] border border-emerald-500/20 bg-emerald-950/20 px-2 py-0.5 rounded text-[9px] font-bold uppercase">
                        Clear
                      </span>
                    )}
                  </td>
                  <td className="p-4 font-mono font-bold text-[#e9c349]">
                    ${calculateGross(e).toFixed(2)}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => setSelectedEntry(e)}
                      className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5 text-[#61e3bb] hover:bg-[#61e3bb]/10 hover:border-[#61e3bb]/30 transition-all font-bold text-[10px] uppercase"
                    >
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjustments Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-[#00110d]/80 z-50 flex items-center justify-center p-6">
          <div className="glass-panel-floating rounded-3xl p-8 max-w-md w-full border border-white/10 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Adjustment for {selectedEntry.name}</h3>
              <p className="text-[10px] text-slate-400 mt-1">Add bonuses or apply fines to this payroll period.</p>
            </div>

            <form onSubmit={handleApplyAdjustment} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-2">Adjustment Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('bonus')}
                    className={`flex-1 py-2 rounded-lg font-bold border transition-all text-xs ${
                      adjustType === 'bonus' 
                        ? 'bg-[#142f28] border-[#61e3bb]/45 text-[#61e3bb]' 
                        : 'bg-[#00110d] border-white/5 text-slate-400'
                    }`}
                  >
                    Credit Bonus
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('fine')}
                    className={`flex-1 py-2 rounded-lg font-bold border transition-all text-xs ${
                      adjustType === 'fine' 
                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-400' 
                        : 'bg-[#00110d] border-white/5 text-slate-400'
                    }`}
                  >
                    Apply Fine
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-2">Amount (USD)</label>
                <input
                  type="number"
                  required
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(parseFloat(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 bg-[#00110d] border border-white/10 rounded-xl text-white font-mono text-sm focus:border-[#61e3bb] outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#bbcac2] uppercase tracking-wider mb-2">Mandatory Reasoning Note</label>
                <textarea
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Specify compensation adjustment reasons (fines require detailed operational notes)..."
                  className="w-full px-4 py-2.5 text-xs bg-[#00110d] border border-white/10 rounded-xl text-white placeholder-slate-600 focus:border-[#61e3bb] outline-none transition-all h-20 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedEntry(null)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#61e3bb] hover:bg-[#3fc7a0] text-[#00382a] rounded-xl font-bold transition-all text-xs border border-[#78f9cf]/20"
                >
                  Commit Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
