'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, LifeBuoy, X } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { useAuth } from '@/lib/auth/AuthProvider';
import { reportError, reportWarning } from '@/lib/errors';
import { api } from '@/lib/api';
import {
  cancelRdpReservation,
  claimRdp,
  closeReservedTab,
  createRdpReservation,
  getMyActiveRdp,
  listMyRdpReservations,
  probeRdp,
  reserveDesktopTab,
  sendTabToDesktop,
  type MyActiveRdp,
  type RdpClaimReservation,
  type RdpPortal,
  type RdpResource,
} from '@/lib/rdp';

interface RdpClaimBoardProps {
  /** Optional link back to the RDP resources page (admin). */
  resourcesHref?: string;
  /**
   * Portal this board is mounted under. Session links stay inside it, so an
   * executive claiming a desktop is not dropped into the worker shell.
   */
  basePath?: RdpPortal;
}

function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h <= 0) return `${mins}m`;
  if (mins === 0) return `${h}h`;
  return `${h}h ${mins}m`;
}

function formatEat(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Africa/Nairobi',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' EAT';
  } catch {
    return iso;
  }
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RdpClaimBoard({
  resourcesHref,
  basePath = '/worker',
}: RdpClaimBoardProps) {
  const { session, isLoading: authLoading } = useAuth();
  const [machines, setMachines] = useState<RdpResource[]>([]);
  const [myActive, setMyActive] = useState<MyActiveRdp | null>(null);
  const [myWorkerId, setMyWorkerId] = useState<string | null>(null);
  const [myReservations, setMyReservations] = useState<RdpClaimReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [info, setInfo] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<RdpResource | null>(null);
  const [schedStart, setSchedStart] = useState('');
  const [schedEnd, setSchedEnd] = useState('');
  const [schedSaving, setSchedSaving] = useState(false);

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
        if (e.data?.type === 'session-ended') {
          setMyActive(null);
          setClaiming(null);
        }
        void loadMachines();
      };
    } catch { /* ignore */ }
    return () => { try { ch?.close(); } catch { /* ignore */ } };
  }, [loadMachines]);

  const openSchedule = (m: RdpResource) => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start);
    end.setHours(end.getHours() + 2);
    setSchedStart(toLocalInputValue(start));
    setSchedEnd(toLocalInputValue(end));
    setScheduleFor(m);
    setError(null);
  };

  const submitSchedule = async () => {
    if (!scheduleFor || !myWorkerId) return;
    setSchedSaving(true);
    setError(null);
    try {
      await createRdpReservation(scheduleFor.id, {
        worker_id: myWorkerId,
        starts_at: new Date(schedStart).toISOString(),
        ends_at: new Date(schedEnd).toISOString(),
      });
      setScheduleFor(null);
      setInfo(`Claim schedule saved for ${scheduleFor.nickname}.`);
      await loadMachines();
    } catch (e) {
      setError(reportError('Create claim schedule', e));
    } finally {
      setSchedSaving(false);
    }
  };

  const handleCancelReservation = async (r: RdpClaimReservation) => {
    try {
      await cancelRdpReservation(r.rdp_resource_id, r.id);
      await loadMachines();
    } catch (e) {
      setError(reportError('Cancel claim schedule', e));
    }
  };

  const handleClaim = async (machineId: string) => {
    setClaiming(machineId);
    setError(null);
    setInfo(null);
    let navigated = false;
    const desktopTab = reserveDesktopTab(machineId);
    if (!desktopTab) {
      setInfo('Allow pop-ups for this site so the remote desktop can open in its own tab.');
    }
    try {
      try {
        const ready = await probeRdp(machineId);
        if (!ready.ok) {
          closeReservedTab(desktopTab);
          setError(ready.error || 'This machine is not reachable right now.');
          setFailedAttempts((n) => n + 1);
          return;
        }
      } catch (probeErr) {
        closeReservedTab(desktopTab);
        setError(reportError('RDP preflight', probeErr, { machineId }));
        setFailedAttempts((n) => n + 1);
        return;
      }
      const result = await claimRdp(machineId);
      if (result.resumed) {
        setInfo(`Resuming your existing session on this machine.`);
      } else if (result.guacamole_error && !result.guacamole_viewer_path) {
        setInfo(`Claimed, but remote desktop may not open: ${result.guacamole_error}`);
      }
      sendTabToDesktop(desktopTab, machineId, basePath);
      navigated = true;
      setFailedAttempts(0);
      window.location.assign(`${basePath}/rdp-session/${machineId}`);
    } catch (e) {
      closeReservedTab(desktopTab);
      const msg = reportError('Claim RDP', e, { machineId });
      const raw = e instanceof Error ? e.message : String(e);
      if (raw.includes('already have an open session') || msg.includes('already have an open session')) {
        const active = await getMyActiveRdp().catch(() => null);
        if (active?.rdp_resource_id) {
          navigated = true;
          window.location.assign(`${basePath}/rdp-session/${active.rdp_resource_id}`);
        }
      }
      if (!navigated) {
        setError(msg);
        setFailedAttempts((n) => n + 1);
      }
    } finally {
      if (!navigated) setClaiming(null);
    }
  };

  const isStaff = ['admin', 'executive', 'super_admin'].includes(session?.authRole ?? '');

  const canClaim = (m: RdpResource) => {
    if (myActive) return false;
    if (['maintenance', 'admin_locked', 'offline', 'unhealthy'].includes(m.status)) return false;
    if (!isStaff && m.assigned_worker_id && myWorkerId && m.assigned_worker_id !== myWorkerId) {
      return false;
    }
    // Reserved to someone else — workers cannot claim.
    if (
      !isStaff
      && m.reserved_for_worker_id
      && myWorkerId
      && m.reserved_for_worker_id !== myWorkerId
    ) {
      return false;
    }
    // Day budget exhausted (reported on-image time).
    if (!isStaff && (m.remaining_minutes_today ?? 1) <= 0) {
      return false;
    }
    if (!isStaff) {
      if (myWorkerId && m.assigned_worker_id === myWorkerId) {
        return m.status === 'online_free' || m.status === 'assigned';
      }
      return m.status === 'online_free';
    }
    if (m.status === 'online_free') return true;
    if (m.status === 'assigned' && myWorkerId && m.assigned_worker_id === myWorkerId) return true;
    return false;
  };

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
            <div key={n} className="glass-panel p-5 animate-pulse h-40" />
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
            ? 'Claim a free desktop and open a session. Manage machines from Resources.'
            : undefined
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

      {failedAttempts >= 3 && (
        <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 text-sm">
          <LifeBuoy size={16} className="mt-0.5 shrink-0 text-emerald-accent" />
          <span className="text-theme-muted">
            That has failed {failedAttempts} times. If it keeps happening,{' '}
            <Link href={`${basePath}/chat`} className="font-semibold text-emerald-accent hover:underline">
              message an administrator
            </Link>{' '}
            and we will look at the machine.
          </span>
        </div>
      )}
      {info && <p className="text-emerald-accent text-sm mb-4">{info}</p>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel p-5 animate-pulse h-40" />
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
            const isMine = myActive?.rdp_resource_id === m.id;
            const claimable = canClaim(m);
            const limitMin = Math.round(Number(m.daily_limit_hours ?? 12) * 60);
            const remaining = m.remaining_minutes_today ?? limitMin;
            const used = m.used_minutes_today ?? 0;
            const reservedElsewhere =
              !isStaff
              && m.reserved_for_worker_id
              && myWorkerId
              && m.reserved_for_worker_id !== myWorkerId;
            return (
              <div key={m.id} className="glass-panel p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs font-mono text-theme-muted">{m.id.slice(0, 8)}…</p>
                    <h3 className="text-base font-bold text-white">{m.nickname}</h3>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
                <div className="flex justify-between text-xs text-theme-muted mb-2">
                  <span>{m.country}</span>
                  <span>{m.client_group}</span>
                </div>
                <div className="mb-3 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-theme-muted mb-0.5">
                    Reported today (resets 10:00 EAT)
                  </p>
                  <p className="text-sm text-white font-semibold">
                    {formatMinutes(remaining)} left · {formatMinutes(used)} / {formatMinutes(limitMin)} used
                  </p>
                  {m.window_ends_at && (
                    <p className="text-[10px] text-theme-muted mt-0.5">
                      Window ends {formatEat(m.window_ends_at)}
                    </p>
                  )}
                  {m.reservation_ends_at && (
                    <p className="text-[10px] text-gold-accent mt-1">
                      {reservedElsewhere
                        ? `Reserved until ${formatEat(m.reservation_ends_at)}`
                        : `Reserved for you until ${formatEat(m.reservation_ends_at)}`}
                    </p>
                  )}
                </div>
                {isMine ? (
                  <Link
                    href={`${basePath}/rdp-session/${m.id}`}
                    className="btn-primary w-full text-sm text-center block"
                  >
                    Open session
                  </Link>
                ) : claimable ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => handleClaim(m.id)}
                      disabled={claiming === m.id}
                      className="btn-primary w-full text-sm disabled:opacity-50"
                    >
                      {claiming === m.id ? 'Testing connection…' : m.status === 'assigned' ? 'Claim shift machine' : 'Claim'}
                    </button>
                    {myWorkerId && (
                      <button
                        type="button"
                        onClick={() => openSchedule(m)}
                        className="btn-secondary w-full text-xs py-2 flex items-center justify-center gap-1.5"
                      >
                        <CalendarClock size={13} /> Schedule claim
                      </button>
                    )}
                  </div>
                ) : m.status === 'maintenance' ? (
                  <p className="text-xs text-center text-theme-muted">
                    This desktop is being checked by an admin
                  </p>
                ) : !isStaff && remaining <= 0 ? (
                  <p className="text-xs text-center text-theme-muted">
                    No reported time left until the 10:00 EAT reset
                  </p>
                ) : reservedElsewhere ? (
                  <p className="text-xs text-center text-theme-muted">Reserved for another worker</p>
                ) : m.status === 'assigned' || m.status === 'active' || m.status === 'idle' ? (
                  <p className="text-xs text-center text-theme-muted">In use or reserved</p>
                ) : (
                  <p className="text-xs text-center text-theme-muted capitalize">
                    {m.status.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {scheduleFor && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setScheduleFor(null); }}
        >
          <div className="glass-modal w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-sm font-bold text-theme-heading truncate pr-4">
                Schedule claim — {scheduleFor.nickname}
              </h2>
              <button
                type="button"
                onClick={() => setScheduleFor(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-theme-muted">
                When this window starts, only you can claim this desktop (admins can still override).
                Max length is this machine&apos;s daily limit ({scheduleFor.daily_limit_hours ?? 12}h).
              </p>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Starts</span>
                <input
                  type="datetime-local"
                  value={schedStart}
                  onChange={(e) => setSchedStart(e.target.value)}
                  className="input-field"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Ends</span>
                <input
                  type="datetime-local"
                  value={schedEnd}
                  onChange={(e) => setSchedEnd(e.target.value)}
                  className="input-field"
                />
              </label>
              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={() => setScheduleFor(null)} className="btn-secondary text-sm py-2 px-4">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={schedSaving || !schedStart || !schedEnd}
                  onClick={() => void submitSchedule()}
                  className="btn-primary text-sm py-2 px-4 disabled:opacity-60"
                >
                  {schedSaving ? 'Saving…' : 'Save schedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
