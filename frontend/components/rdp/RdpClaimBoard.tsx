'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Monitor, Settings } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import { useAuth } from '@/lib/auth/AuthProvider';
import { reportError, reportWarning } from '@/lib/errors';
import { api } from '@/lib/api';
import {
  cancelRdpReservation,
  getMyActiveRdp,
  listMyRdpReservations,
  type MyActiveRdp,
  type RdpClaimReservation,
  type RdpPortal,
  type RdpResource,
} from '@/lib/rdp';
import { STAFF_ROLES, formatEat, isGreenRdp } from './claimShared';

interface RdpClaimBoardProps {
  /** Optional link back to the RDP resources page (admin). */
  resourcesHref?: string;
  /**
   * Portal this board is mounted under. Session links stay inside it, so an
   * executive claiming a desktop is not dropped into the worker shell.
   */
  basePath?: RdpPortal;
  /** Where each desktop's settings page lives; defaults to `${basePath}/rdp-claim-board`. */
  settingsBase?: string;
}

export default function RdpClaimBoard({
  resourcesHref,
  basePath = '/worker',
  settingsBase,
}: RdpClaimBoardProps) {
  const { session, isLoading: authLoading } = useAuth();
  const [machines, setMachines] = useState<RdpResource[]>([]);
  const [myActive, setMyActive] = useState<MyActiveRdp | null>(null);
  const [myWorkerId, setMyWorkerId] = useState<string | null>(null);
  const [myReservations, setMyReservations] = useState<RdpClaimReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMachines = useCallback(async () => {
    try {
      const [data, active, worker, reservations] = await Promise.all([
        api.get<RdpResource[]>('/rdp'),
        getMyActiveRdp().catch(() => null),
        api.get<{ id: string }>('/workers/me').catch(() => null),
        listMyRdpReservations().catch(() => [] as RdpClaimReservation[]),
      ]);
      setMachines(data);
      setMyActive(active);
      setMyWorkerId(worker?.id ?? null);
      setMyReservations(reservations);
    } catch (err) {
      reportWarning('Load claim board', err);
      setMachines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMachines();
    const interval = setInterval(loadMachines, 10000);
    return () => clearInterval(interval);
  }, [loadMachines]);

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('rdp-events');
      ch.onmessage = (e) => {
        if (e.data?.type === 'session-ended') setMyActive(null);
        void loadMachines();
      };
    } catch { /* ignore */ }
    return () => { try { ch?.close(); } catch { /* ignore */ } };
  }, [loadMachines]);

  const handleCancelReservation = async (r: RdpClaimReservation) => {
    try {
      await cancelRdpReservation(r.rdp_resource_id, r.id);
      await loadMachines();
    } catch (e) {
      setError(reportError('Cancel claim schedule', e));
    }
  };

  const isStaff = STAFF_ROLES.includes(session?.authRole ?? '');
  const ctx = { myActive, myWorkerId, isStaff };
  const settingsRoot = settingsBase ?? `${basePath}/rdp-claim-board`;

  const visibleMachines = isStaff
    ? machines
    : machines.filter(
        (m) =>
          !m.assigned_worker_id ||
          m.assigned_worker_id === myWorkerId ||
          myActive?.rdp_resource_id === m.id,
      );

  if (authLoading) {
    return (
      <div className="max-w-6xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel p-5 animate-pulse h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="RDP Claim Board"
        description={
          resourcesHref
            ? 'Open a desktop’s settings to claim it, schedule time, or change its details.'
            : 'Open a desktop’s settings to claim it or schedule time. Each desktop has its own daily working window (EAT).'
        }
        besideTitle={
          basePath === '/worker' ? (
            <Link
              href="/worker/my-schedule#rdp-claim-schedules"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-theme-heading hover:border-emerald-accent/40 hover:text-emerald-accent transition-colors"
            >
              <CalendarClock size={13} />
              Claim schedules
            </Link>
          ) : null
        }
        actions={
          <span className="flex items-center gap-3">
            {resourcesHref ? (
              <Link href={resourcesHref} className="btn-secondary text-sm py-2 px-3">
                Resources
              </Link>
            ) : null}
            <span className="flex items-center gap-2 text-xs font-mono text-emerald-accent">
              <span className="w-2 h-2 rounded-full bg-emerald-accent animate-pulse" />
              Live
            </span>
          </span>
        }
      />

      {myActive && (
        <div className="glass-panel p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white">
            You have an open session on <strong>{myActive.nickname}</strong>.
          </p>
          <Link
            href={`${basePath}/rdp-session/${myActive.rdp_resource_id}`}
            className="btn-primary text-sm"
          >
            Resume session
          </Link>
        </div>
      )}

      {myReservations.length > 0 && (
        <div className="glass-panel p-4 mb-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">Your claim schedules</p>
          {myReservations.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-white">
                {r.rdp_nickname ?? r.rdp_resource_id.slice(0, 8)} · {formatEat(r.starts_at)} → {formatEat(r.ends_at)}
              </span>
              <button
                type="button"
                onClick={() => void handleCancelReservation(r)}
                className="text-xs text-theme-muted hover:text-danger"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-danger text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel p-5 animate-pulse h-28" />
          ))}
        </div>
      ) : visibleMachines.length === 0 ? (
        <div className="glass-panel p-8 text-center">
          {isStaff ? (
            <>
              <p className="text-theme-muted text-sm mb-2">No RDP machines in the system yet.</p>
              <p className="text-xs text-theme-muted">Machines added by an admin will appear here for claiming.</p>
            </>
          ) : (
            <>
              <p className="text-theme-muted text-sm mb-2">No desktops are assigned to you right now.</p>
              <p className="text-xs text-theme-muted">
                When an administrator assigns a machine or schedules a shift for you, it will show up here.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleMachines.map((m) => {
            const green = isGreenRdp(m, ctx);
            const statusText = myActive?.rdp_resource_id === m.id
              ? 'Your open session'
              : green ? 'Available' : m.status.replace(/_/g, ' ');
            return (
              <Link
                key={m.id}
                href={`${settingsRoot}/${m.id}`}
                aria-label={`${m.nickname} settings (${statusText})`}
                className={`rdp-card ${green ? 'rdp-card--green' : 'rdp-card--gold'} on-dark-surface block p-5 min-h-[112px]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rdp-card__icon w-10 h-10">
                    <Monitor size={18} />
                  </span>
                  <span className="rdp-card__icon rdp-card__gear w-10 h-10" title="Desktop settings">
                    <Settings size={18} />
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${green ? 'bg-emerald-300 animate-pulse' : 'bg-amber-300'}`}
                    title={statusText}
                    aria-hidden
                  />
                  <h3 className="text-lg font-bold text-white truncate">{m.nickname}</h3>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
