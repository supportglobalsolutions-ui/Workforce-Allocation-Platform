'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot } from 'firebase/firestore';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { useAuth } from '@/lib/auth/AuthProvider';
import { api } from '@/lib/api';
import { db, COLLECTIONS } from '@/lib/firebase';
import { claimRdp, getMyActiveRdp, type MyActiveRdp } from '@/lib/rdp';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
  status: string;
  assigned_worker_id: string | null;
  guacamole_connection_id: string | null;
}

const STATE_LEGEND: { status: string; label: string; description: string }[] = [
  { status: 'online_free', label: 'Online Free', description: 'Available, unassigned' },
  { status: 'assigned', label: 'Assigned', description: 'Reserved for your upcoming shift' },
  { status: 'active', label: 'Active', description: 'In live use by a worker' },
  { status: 'idle', label: 'Idle', description: 'No heartbeat detected' },
  { status: 'offline', label: 'Offline', description: 'Unreachable / powered off' },
  { status: 'unhealthy', label: 'Unhealthy', description: 'Reachable but port failing' },
  { status: 'admin_locked', label: 'Locked', description: 'Locked by leadership' },
  { status: 'maintenance', label: 'Maintenance', description: 'Under maintenance' },
];

export default function RdpClaimBoard() {
  const router = useRouter();
  const { session, isLoading: authLoading } = useAuth();
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [myActive, setMyActive] = useState<MyActiveRdp | null>(null);
  const [myWorkerId, setMyWorkerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    } catch {
      setMachines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMachines(); }, [loadMachines]);

  // Firestore realtime status overlay — only after Firebase Auth is ready.
  useEffect(() => {
    if (authLoading || !session) return;

    const unsub = onSnapshot(
      collection(db, COLLECTIONS.RDP_STATUS),
      (snap) => {
        const live: Record<string, { status: string; worker_id: string | null }> = {};
        snap.forEach((doc) => {
          const data = doc.data();
          live[doc.id] = {
            status: String(data.status ?? ''),
            worker_id: data.worker_id ? String(data.worker_id) : null,
          };
        });
        setMachines((prev) =>
          prev.map((m) => {
            const row = live[m.id];
            if (!row?.status) return m;
            return {
              ...m,
              status: row.status,
              assigned_worker_id: row.worker_id ?? m.assigned_worker_id,
            };
          }),
        );
      },
      (err) => {
        console.warn('rdp_status listener:', err.message);
      },
    );
    return () => unsub();
  }, [authLoading, session]);

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('rdp-events');
      ch.onmessage = () => loadMachines();
    } catch { /* ignore */ }
    return () => { try { ch?.close(); } catch { /* ignore */ } };
  }, [loadMachines]);

  const handleClaim = async (machineId: string) => {
    setClaiming(machineId);
    setError(null);
    setInfo(null);
    let navigated = false;
    try {
      const result = await claimRdp(machineId);
      if (result.resumed) {
        setInfo(`Resuming your existing session on this machine.`);
      } else if (result.guacamole_error && !result.guacamole_viewer_path) {
        setInfo(`Claimed, but remote desktop may not open: ${result.guacamole_error}`);
      }
      navigated = true;
      router.push(`/worker/rdp-session/${machineId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to claim machine';
      if (msg.includes('already have an open session')) {
        const active = await getMyActiveRdp().catch(() => null);
        if (active?.rdp_resource_id) {
          navigated = true;
          router.push(`/worker/rdp-session/${active.rdp_resource_id}`);
        }
      }
      if (!navigated) setError(msg);
    } finally {
      if (!navigated) setClaiming(null);
    }
  };

  const canClaim = (m: RDPResource) => {
    if (myActive) return false;
    if (m.status === 'online_free') return true;
    if (m.status === 'assigned' && myWorkerId && m.assigned_worker_id === myWorkerId) return true;
    return false;
  };

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="RDP Claim Board"
        description="Claim an available machine to start your session."
        actions={
          <span className="flex items-center gap-2 text-xs font-mono text-emerald-accent">
            <span className="w-2 h-2 rounded-full bg-emerald-accent animate-pulse" />
            Live
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
      {info && <p className="text-emerald-accent text-sm mb-4">{info}</p>}

      <div className="glass-panel p-4 mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-theme-muted mb-3">Machine states</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {STATE_LEGEND.map((s) => (
            <div key={s.status} className="flex items-start gap-2 text-xs">
              <StatusBadge status={s.status} label={s.label} />
              <span className="text-theme-muted leading-snug">{s.description}</span>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel p-5 animate-pulse h-40" />
          ))}
        </div>
      ) : machines.length === 0 ? (
        <div className="glass-panel p-8 text-center">
          <p className="text-theme-muted text-sm mb-2">No RDP machines in the system yet.</p>
          <p className="text-xs text-theme-muted">Machines added by an admin will appear here for claiming.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {machines.map((m) => {
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
                    {claiming === m.id ? 'Claiming…' : m.status === 'assigned' ? 'Claim shift machine' : 'Claim'}
                  </button>
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
