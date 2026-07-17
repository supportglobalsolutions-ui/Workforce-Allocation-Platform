'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, Clock, Monitor, Play, Star, Trophy, Wallet } from 'lucide-react';

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

interface Me {
  work_ready: boolean;
  worker_type: string;
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
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<WorkSession[]>('/sessions?limit=200'),
      api.get<QualityScore | null>('/quality/me'),
      api.get<Me>('/workers/me'),
    ])
      .then(([sessionList, qualityScore, worker]) => {
        setTotalSessions(sessionList.length);
        setSessions(sessionList.slice(0, 4));
        setQuality(qualityScore);
        setMe(worker);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-theme-muted text-sm animate-pulse">Loading...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="glass-panel rounded-2xl border border-danger/20 p-6 max-w-lg">
        <p className="text-danger text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <PageHeader
        title="Dashboard"
        description={`${totalSessions === 200 ? '200+' : totalSessions} sessions on record · Overview of your performance and quick access to daily tasks.`}
      />

      {me?.work_ready === false && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400">
            <span className="font-bold">Training required</span> — you must complete onboarding training and be cleared by an admin before claiming RDP sessions.{' '}
            <Link href="/worker/training" className="font-bold underline hover:no-underline">
              Go to training
            </Link>
          </p>
        </div>
      )}

      {/* KPI metrics */}
      <section aria-label="Performance metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
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
      </section>

      {/* Quick actions */}
      <section aria-label="Quick actions">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-theme-muted">Quick actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <Link
            href="/worker/rdp-claim-board"
            className="group glass-panel glass-panel-hover rounded-2xl border border-white/5 p-5 flex items-center gap-4 transition-all duration-300"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-accent/20 bg-emerald-accent/10 text-emerald-accent transition-transform duration-300 group-hover:scale-105">
              <Monitor size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">Claim RDP</span>
              <span className="block text-xs text-theme-muted mt-0.5 truncate">Start a remote session</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-theme-muted opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
          </Link>
          <Link
            href="/worker/active-session"
            className="group glass-panel glass-panel-hover rounded-2xl border border-white/5 p-5 flex items-center gap-4 transition-all duration-300"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition-transform duration-300 group-hover:scale-105">
              <Play size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">Active session</span>
              <span className="block text-xs text-theme-muted mt-0.5 truncate">View current work</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-theme-muted opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
          </Link>
          <Link
            href="/worker/wallet"
            className="group glass-panel glass-panel-hover rounded-2xl border border-white/5 p-5 flex items-center gap-4 transition-all duration-300"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold-accent/20 bg-gold-accent/10 text-gold-accent transition-transform duration-300 group-hover:scale-105">
              <Wallet size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">Wallet & payments</span>
              <span className="block text-xs text-theme-muted mt-0.5 truncate">Period, tier & pay alerts</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-theme-muted opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
          </Link>
        </div>
      </section>

      {/* Recent sessions */}
      <section aria-label="Recent sessions" className="glass-panel rounded-2xl border border-white/5 p-5 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5 pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Recent sessions</h2>
            <p className="text-xs text-theme-muted mt-1">
              {sessions.length === 0
                ? 'No sessions yet'
                : `Showing ${sessions.length} of ${totalSessions === 200 ? '200+' : totalSessions}`}
            </p>
          </div>
          <Link
            href="/worker/session-history"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-accent hover:text-emerald-accent/80 transition-colors"
          >
            View all
            <ChevronRight size={14} />
          </Link>
        </div>

        {/* Column headers — desktop only */}
        {sessions.length > 0 && (
          <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] gap-4 px-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-theme-muted">
            <span>Session</span>
            <span>Date</span>
            <span>Duration</span>
            <span className="text-right">Status</span>
          </div>
        )}

        <div className="space-y-2 md:space-y-2.5">
          {sessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center">
              <p className="text-sm text-theme-muted">No sessions yet.</p>
              <Link
                href="/worker/rdp-claim-board"
                className="inline-flex mt-3 text-xs font-semibold text-emerald-accent hover:underline"
              >
                Claim an RDP to get started
              </Link>
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="group rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 md:py-4 transition-all duration-200 hover:border-emerald-accent/25 hover:bg-emerald-accent/[0.04] hover:shadow-[0_8px_24px_-8px_rgba(63,199,160,0.12)]"
              >
                <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-accent/10 border border-emerald-accent/20 text-xs font-bold text-emerald-accent uppercase">
                      {(TYPE_LABELS[s.session_type] ?? s.session_type).slice(0, 2)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {TYPE_LABELS[s.session_type] ?? s.session_type}
                      </p>
                      <p className="text-[11px] text-theme-muted font-mono truncate md:hidden">
                        {new Date(s.start_time).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <p className="hidden md:block text-sm text-theme-muted truncate">
                    {new Date(s.start_time).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>

                  <p className="text-sm text-white/80 font-mono md:text-theme-muted">
                    <span className="md:hidden text-[10px] uppercase tracking-wider text-theme-muted mr-2">Duration</span>
                    {formatDuration(s.duration_minutes)}
                  </p>

                  <div className="flex items-center justify-between md:justify-end gap-2">
                    <StatusBadge status={s.close_status ?? 'pending'} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {sessions.length > 0 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/[0.06]">
            <p className="text-xs text-theme-muted">
              Showing {sessions.length} of {totalSessions === 200 ? '200+' : totalSessions}
            </p>
            <Link
              href="/worker/session-history"
              className="text-xs font-semibold text-emerald-accent hover:underline"
            >
              See full history
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
