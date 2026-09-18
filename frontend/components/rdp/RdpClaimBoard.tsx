'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { LifeBuoy } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { useAuth } from '@/lib/auth/AuthProvider';
import { reportError, reportWarning } from '@/lib/errors';
import { api } from '@/lib/api';
import {
  claimRdp,
  closeReservedTab,
  getMyActiveRdp,
  probeRdp,
  reserveDesktopTab,
  sendTabToDesktop,
  type MyActiveRdp,
} from '@/lib/rdp';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
  status: string;
  assigned_worker_id: string | null;
  guacamole_connection_id: string | null;
}

interface RdpClaimBoardProps {
  /** Optional link back to the RDP resources page (admin). */
  resourcesHref?: string;
}

export default function RdpClaimBoard({ resourcesHref }: RdpClaimBoardProps) {
  const { session, isLoading: authLoading } = useAuth();
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [myActive, setMyActive] = useState<MyActiveRdp | null>(null);
  const [myWorkerId, setMyWorkerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [info, setInfo] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const loadMachines = useCallback(async () => {
    try {
      const [data, active, worker] = await Promise.all([
        api.get<RDPResource[]>('/rdp'),
        getMyActiveRdp().catch(() => null),
        api.get<{ id: string }>('/workers/me').catch(() => null),
      ]);
      setMachines(data);
      setMyActive(active);
      setMyWorkerId(worker?.id ?? null);
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
      sendTabToDesktop(desktopTab, machineId);
      navigated = true;
      setFailedAttempts(0);
      window.location.assign(`/worker/rdp-session/${machineId}`);
    } catch (e) {
      closeReservedTab(desktopTab);
      const msg = reportError('Claim RDP', e, { machineId });
      const raw = e instanceof Error ? e.message : String(e);
      if (raw.includes('already have an open session') || msg.includes('already have an open session')) {
        const active = await getMyActiveRdp().catch(() => null);
        if (active?.rdp_resource_id) {
          navigated = true;
          window.location.assign(`/worker/rdp-session/${active.rdp_resource_id}`);
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

  const canClaim = (m: RDPResource) => {
    if (myActive) return false;
    if (['maintenance', 'admin_locked', 'offline', 'unhealthy'].includes(m.status)) return false;
    // Workers never claim another person's reserved machine.
    if (!isStaff && m.assigned_worker_id && myWorkerId && m.assigned_worker_id !== myWorkerId) {
      return false;
    }
    if (!isStaff) {
      // Workers only act on desktops reserved for them (assignment) or shift-visible free seats.
      if (myWorkerId && m.assigned_worker_id === myWorkerId) {
        return m.status === 'online_free' || m.status === 'assigned';
      }
      // Visible via approved shift only — still must be free/assigned, not in use by others.
      return m.status === 'online_free';
    }
    if (m.status === 'online_free') return true;
    if (m.status === 'assigned' && myWorkerId && m.assigned_worker_id === myWorkerId) return true;
    return false;
  };

  // Workers: never list someone else's reserved desktop (backend already filters; belt-and-suspenders).
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
            href={`/worker/rdp-session/${myActive.rdp_resource_id}`}
            className="btn-primary text-sm"
          >
            Resume session
          </Link>
        </div>
      )}

      {error && <p className="text-danger text-sm mb-4">{error}</p>}

      {failedAttempts >= 3 && (
        <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 text-sm">
          <LifeBuoy size={16} className="mt-0.5 shrink-0 text-emerald-accent" />
          <span className="text-theme-muted">
            That has failed {failedAttempts} times. If it keeps happening,{' '}
            <Link href="/worker/chat" className="font-semibold text-emerald-accent hover:underline">
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
            return (
              <div key={m.id} className="glass-panel p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs font-mono text-theme-muted">{m.id.slice(0, 8)}…</p>
                    <h3 className="text-base font-bold text-white">{m.nickname}</h3>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
                <div className="flex justify-between text-xs text-theme-muted mb-4">
                  <span>{m.country}</span>
                  <span>{m.client_group}</span>
                </div>
                {isMine ? (
                  <Link
                    href={`/worker/rdp-session/${m.id}`}
                    className="btn-primary w-full text-sm text-center block"
                  >
                    Open session
                  </Link>
                ) : claimable ? (
                  <button
                    onClick={() => handleClaim(m.id)}
                    disabled={claiming === m.id}
                    className="btn-primary w-full text-sm disabled:opacity-50"
                  >
                    {claiming === m.id ? 'Testing connection…' : m.status === 'assigned' ? 'Claim shift machine' : 'Claim'}
                  </button>
                ) : m.status === 'maintenance' ? (
                  <p className="text-xs text-center text-theme-muted">
                    This desktop is being checked by an admin
                  </p>
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
    </div>
  );
}
