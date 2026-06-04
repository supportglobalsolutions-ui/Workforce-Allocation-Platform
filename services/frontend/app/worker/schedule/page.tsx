'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Calendar, Clock, Send, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface ScheduleSlot {
  day: string;
  time: string;
  selected: boolean;
}

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const timeSlots = ['08:00 - 12:00', '12:00 - 16:00', '16:00 - 20:00'];

export default function WorkerSchedule() {
  const [slots, setSlots] = useState<ScheduleSlot[]>(
    daysOfWeek.flatMap(d => timeSlots.map(t => ({ day: d, time: t, selected: false })))
  );
  const [isSubmitted, setIsSubmitted] = useState(false);

  const toggleSlot = (day: string, time: string) => {
    if (isSubmitted) return; // Prevent editing after submission
    setSlots(prev => prev.map(s => {
      if (s.day === day && s.time === time) {
        return { ...s, selected: !s.selected };
      }
      return s;
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (slots.filter(s => s.selected).length === 0) return;
    setIsSubmitted(true);
  };

  return (
    <DashboardLayout role="worker">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight leading-none">My Shift Schedule</h2>
          <p className="text-[#bbcac2] mt-2 text-sm">Select shift slots to submit availability blocks for Operations review.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Scheduler Grid */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-white/5">
              <Calendar size={14} className="text-[#61e3bb]" />
              <span>Weekly Availability Planner</span>
            </h3>

            {isSubmitted && (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-[#61e3bb] text-xs font-bold font-sans">
                ✓ Availability block submitted. Awaiting Operations Lead shift assignment.
              </div>
            )}

            <div className="space-y-4">
              {daysOfWeek.map((day) => (
                <div key={day} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center border-b border-white/5 pb-4 last:border-0 last:pb-0">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">{day}</span>
                  
                  <div className="md:col-span-3 grid grid-cols-3 gap-2">
                    {timeSlots.map((time) => {
                      const slot = slots.find(s => s.day === day && s.time === time);
                      const isSelected = slot ? slot.selected : false;

                      return (
                        <button
                          key={time}
                          type="button"
                          disabled={isSubmitted}
                          onClick={() => toggleSlot(day, time)}
                          className={`py-3.5 rounded-xl border text-[10px] font-bold tracking-tight uppercase transition-all duration-200 ${
                            isSelected 
                              ? 'bg-[#142f28] border-[#61e3bb]/40 text-[#61e3bb] shadow-inner'
                              : 'bg-[#00110d] border-white/5 text-slate-400 hover:text-white hover:border-white/10'
                          }`}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {!isSubmitted && (
              <div className="flex justify-end pt-4 border-t border-white/5">
                <button
                  type="submit"
                  disabled={slots.filter(s => s.selected).length === 0}
                  className="px-8 py-3.5 bg-[#61e3bb] hover:bg-[#3fc7a0] text-[#00382a] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(97,227,187,0.15)] flex items-center justify-center gap-2 border border-[#78f9cf]/20 text-xs uppercase tracking-wider"
                >
                  <Send size={12} />
                  <span>Submit Selection Availability</span>
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Sidebar Context */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-white/5">
              Scheduling Policy Guidelines
            </h3>
            
            <div className="space-y-3 text-xs leading-relaxed text-[#bbcac2]">
              <p>
                <strong className="text-white block mb-0.5">1. Pre-Submission Lockout</strong>
                Availability blocks must be submitted 48 hours prior to shift commencement.
              </p>
              <p>
                <strong className="text-white block mb-0.5">2. Core Allocations</strong>
                Ops leads will allocate RDP slots based on your rolling quality metrics. Higher scores receive primary region slots.
              </p>
              <p>
                <strong className="text-white block mb-0.5">3. Attendance Mandate</strong>
                Claiming a shift is mandatory. Unclaimed assignments lower your rolling reliability rate.
              </p>
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
