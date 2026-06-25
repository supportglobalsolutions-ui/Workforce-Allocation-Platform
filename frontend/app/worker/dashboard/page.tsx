'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Clock, Monitor, PenLine, Play, Star, Trophy } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';

interface WorkSession {
  id: string;
  session_type: string;
  start_time: string;
  duration_minutes: number | null;
  close_status: string | null;
  rdp_resource_id: string | null;
}

interface QualityScore {
  composite_score: number;
  global_rank: number | null;
  session_streak_days: number | null;
}

const TYPE_LABELS: Record<string, string> = {
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

function formatDuration(minutes: number | null): string {
  if (!minutes) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function WorkerDashboard() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [quality, setQuality] = useState<QualityScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<WorkSession[]>('/sessions?limit=200'),
      api.get<QualityScore | null>('/quality/me'),
    ])
      .then(([sessionList, qualityScore]) => {
        setTotalSessions(sessionList.length);
        setSessions(sessionList.slice(0, 4));
        setQuality(qualityScore);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-theme-muted text-sm mt-4">Loading...</p>;
  if (error) return <p className="text-danger text-sm mt-4">{error}</p>;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Dashboard"
        description="Overview of your performance and quick access to daily tasks."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <KpiCard
          label="Rank"
          value={quality?.global_rank != null ? `#${quality.global_rank}` : '—'}
          icon={Trophy}
          accent="gold"
        />
        <KpiCard
          label="Quality"
          value={quality?.composite_score != null ? Number(quality.composite_score).toFixed(1) : '—'}
          icon={Star}
        />
        <KpiCard
          label="Sessions"
          value={totalSessions === 200 ? '200+' : String(totalSessions)}
          change={`+${sessions.length} recent`}
          icon={Clock}
        />
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
          {sessions.length === 0 ? (
            <p className="text-xs text-theme-muted py-3">No sessions yet.</p>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-3 text-sm gap-4">
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">
                    {TYPE_LABELS[s.session_type] ?? s.session_type}
                  </p>
                  <p className="text-xs text-theme-muted">
                    {new Date(s.start_time).toLocaleDateString()} · {formatDuration(s.duration_minutes)}
                  </p>
                </div>
                <StatusBadge status={s.close_status ?? 'pending'} />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
