'use client';

import { useCallback, useEffect, useState } from 'react';

import { reportError } from '@/lib/errors';
import {
  claimRdp,
  closeReservedTab,
  getMyActiveRdp,
  probeRdp,
  reserveDesktopTab,
  sendTabToDesktop,
  type MyActiveRdp,
  type RdpPortal,
  type RdpResource,
} from '@/lib/rdp';

export const STAFF_ROLES = ['admin', 'executive', 'super_admin'];
export const RDP_EDITOR_ROLES = ['admin', 'super_admin'];

export function formatEat(iso: string | null | undefined): string {
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

export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "2h 03m 09s", "4m 05s", "12s". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

/** Current time, re-rendered every `intervalMs` for live countdowns. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export interface ClaimContext {
  myActive: MyActiveRdp | null;
  myWorkerId: string | null;
  isStaff: boolean;
}

export function canClaimRdp(m: RdpResource, { myActive, myWorkerId, isStaff }: ClaimContext): boolean {
  if (myActive) return false;
  if (['maintenance', 'admin_locked', 'offline', 'unhealthy'].includes(m.status)) return false;
  if (!isStaff && m.assigned_worker_id && myWorkerId && m.assigned_worker_id !== myWorkerId) {
    return false;
  }
  // Reserved to someone else — workers cannot claim.
  if (!isStaff && m.reserved_for_worker_id && myWorkerId && m.reserved_for_worker_id !== myWorkerId) {
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
}

/** Why a desktop cannot be claimed right now, in words a worker understands. */
export function unclaimableReason(m: RdpResource, ctx: ClaimContext): string {
  const reservedElsewhere =
    !ctx.isStaff && m.reserved_for_worker_id && ctx.myWorkerId && m.reserved_for_worker_id !== ctx.myWorkerId;
  if (ctx.myActive && ctx.myActive.rdp_resource_id !== m.id) {
    return `You already have a session open on ${ctx.myActive.nickname}.`;
  }
  if (m.status === 'maintenance') return 'This desktop is being checked by an admin.';
  if (reservedElsewhere) return 'Reserved for another worker.';
  if (['assigned', 'active', 'idle'].includes(m.status)) return 'In use or reserved.';
  return m.status.replace(/_/g, ' ');
}

/** True for desktops shown in the green (available / yours) style. */
export function isGreenRdp(m: RdpResource, ctx: ClaimContext): boolean {
  if (ctx.myActive?.rdp_resource_id === m.id) return true;
  return canClaimRdp(m, { ...ctx, myActive: null });
}

export function useRdpClaim(basePath: RdpPortal) {
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const claim = useCallback(async (machineId: string) => {
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
        setInfo('Resuming your existing session on this machine.');
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
  }, [basePath]);

  return { claim, claiming, error, setError, info, setInfo, failedAttempts };
}
