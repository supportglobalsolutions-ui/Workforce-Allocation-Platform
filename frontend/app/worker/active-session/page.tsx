'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { Wifi, Heart, Monitor } from 'lucide-react';

export default function ActiveSessionPage() {
  const [seconds, setSeconds] = useState(15797);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Active session"
        description="Current RDP work session."
        actions={<StatusBadge status="active" label="Live" />}
      />
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-panel p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-4">Session Timer</p>
          <p className="text-5xl md:text-6xl font-black font-mono text-emerald-accent text-glow-emerald">{h}:{m}:{s}</p>
          <button className="btn-secondary mt-8 w-full max-w-xs mx-auto border-danger/30 text-danger hover:bg-danger/10">
            End Session
          </button>
        </div>
        <div className="space-y-4">
          <div className="glass-panel p-6">
            <div className="flex items-center gap-2 mb-4"><Monitor size={18} className="text-emerald-accent" /><h2 className="font-bold text-white">Machine Details</h2></div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-brand-on-surface-variant text-xs">Machine</span><p className="text-white font-medium">Nairobi Alpha</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">ID</span><p className="text-white font-mono">RDP-KE-001</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">Country</span><p className="text-white">Kenya</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">Client</span><p className="text-white">Client A</p></div>
            </div>
          </div>
          <div className="glass-panel p-6">
            <h2 className="font-bold text-white mb-4">Session Details</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-brand-on-surface-variant text-xs">Session ID</span><p className="text-white font-mono">SES-00482</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">Type</span><p className="text-white">GS RDP</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">Started</span><p className="text-white">09:15 EAT</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">Guacamole</span><p className="text-emerald-accent">Connected</p></div>
            </div>
          </div>
          <div className="glass-panel p-6 flex gap-6">
            <div className="flex items-center gap-2"><Wifi size={16} className="text-success" /><span className="text-sm text-white">Connection: <span className="text-success">Stable</span></span></div>
            <div className="flex items-center gap-2"><Heart size={16} className="text-emerald-accent animate-pulse" /><span className="text-sm text-white">Heartbeat: <span className="text-emerald-accent">Active</span></span></div>
          </div>
        </div>
      </div>
      <p className="text-xs text-brand-on-surface-variant mt-6 text-center">
        RDP credentials are managed server-side via Apache Guacamole and never exposed to your browser.
      </p>
    </div>
  );
}
