'use client';

import Link from 'next/link';
import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import StatusBadge from '@/components/platform/StatusBadge';
import { Trophy, Star, Clock, Monitor, PenLine, Play } from 'lucide-react';
import { sessions } from '@/lib/mock-data';

const recentSessions = sessions.slice(0, 4);

export default function WorkerDashboard() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Dashboard"
        description="Overview of your performance and quick access to daily tasks."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <KpiCard label="Rank" value="#3" change="+2 this week" icon={Trophy} accent="gold" />
        <KpiCard label="Quality" value="96.4" icon={Star} />
        <KpiCard label="Sessions" value="247" change="+12 this month" icon={Clock} />
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <Link href="/worker/rdp-claim-board" className="btn-primary flex items-center gap-2 text-sm">
          <Monitor size={16} />
          Claim RDP
        </Link>
        <Link href="/worker/active-session" className="btn-secondary flex items-center gap-2 text-sm">
          <Play size={16} />
          Active session
        </Link>
        <Link href="/worker/external-session" className="btn-secondary flex items-center gap-2 text-sm">
          <PenLine size={16} />
          Log session
        </Link>
      </div>

      <section className="glass-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white">Recent sessions</h2>
          <Link href="/worker/session-history" className="text-xs text-emerald-accent hover:underline">
            View all
          </Link>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {recentSessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-3 text-sm gap-4">
              <div className="min-w-0">
                <p className="text-white font-medium truncate">{s.machine}</p>
                <p className="text-xs text-theme-muted">{s.date} · {s.duration}</p>
              </div>
              <StatusBadge status={s.status as string} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
