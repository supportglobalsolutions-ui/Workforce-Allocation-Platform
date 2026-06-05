'use client';

import Link from 'next/link';
import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import { Trophy, Star, Flame, Clock, Monitor, PenLine, BookOpen } from 'lucide-react';
import { sessions, leaderboard } from '@/lib/mock-data';

export default function WorkerDashboard() {
  return (
    <div>
      <PageHeader
        title="Worker Dashboard"
        description="Your home screen — rank, quality score, upcoming shifts, recent sessions, and quick actions."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Active Rank" value="#3" change="+2 this week" icon={Trophy} accent="gold" />
        <KpiCard label="Quality Score" value="96.4" change="Top 5%" icon={Star} />
        <KpiCard label="Current Streak" value="11 days" icon={Flame} accent="gold" />
        <KpiCard label="Total Sessions" value="247" change="+12 this month" icon={Clock} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="glass-panel p-6 lg:col-span-1">
          <h2 className="text-sm font-bold text-white mb-4">Upcoming Shifts</h2>
          <div className="space-y-3">
            {[
              { date: 'Today', time: '09:00 – 17:00', client: 'Client A' },
              { date: 'Tomorrow', time: '08:00 – 16:00', client: 'Client B' },
            ].map((s) => (
              <div key={s.date} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-xs font-bold text-emerald-accent">{s.date}</p>
                <p className="text-sm text-white font-semibold">{s.time}</p>
                <p className="text-xs text-brand-on-surface-variant">{s.client}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-6 lg:col-span-1">
          <h2 className="text-sm font-bold text-white mb-4">Notifications</h2>
          <div className="space-y-2 text-sm">
            <p className="text-brand-on-surface-variant"><span className="text-warning">●</span> Assessment due in 2 days</p>
            <p className="text-brand-on-surface-variant"><span className="text-emerald-accent">●</span> Quality score updated: 96.4</p>
            <p className="text-brand-on-surface-variant"><span className="text-gold-accent">●</span> Rank improved to #3 globally</p>
          </div>
        </div>

        <div className="glass-panel p-6 lg:col-span-1">
          <h2 className="text-sm font-bold text-white mb-4">Leaderboard Preview</h2>
          <div className="space-y-2">
            {leaderboard.slice(0, 5).map((w) => (
              <div key={w.rank} className="flex items-center justify-between text-sm">
                <span className="text-gold-accent font-mono font-bold">#{w.rank}</span>
                <span className="text-white flex-1 mx-2 truncate">{w.name}</span>
                <span className="text-emerald-accent font-mono">{w.score}</span>
              </div>
            ))}
          </div>
          <Link href="/worker/leaderboard" className="text-xs text-emerald-accent hover:underline mt-3 inline-block">View full leaderboard →</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <Link href="/worker/rdp-claim-board" className="btn-primary flex items-center gap-2"><Monitor size={16} />Claim RDP</Link>
        <Link href="/worker/external-session" className="btn-secondary flex items-center gap-2"><PenLine size={16} />Log Session</Link>
        <Link href="/worker/assessments" className="btn-gold flex items-center gap-2"><BookOpen size={16} />View Assessments</Link>
      </div>

      <h2 className="text-sm font-bold text-white mb-4">Recent Sessions</h2>
      <DataTable
        columns={[
          { key: 'date', header: 'Date' },
          { key: 'machine', header: 'Machine' },
          { key: 'duration', header: 'Duration' },
          { key: 'type', header: 'Type' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status as string} /> },
        ]}
        data={sessions as Record<string, unknown>[]}
      />
    </div>
  );
}
