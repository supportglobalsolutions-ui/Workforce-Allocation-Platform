'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';
import { claimRdp, getMyActiveRdp, type MyActiveRdp } from '@/lib/rdp';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
  status: string;
  guacamole_connection_id: string | null;
}

export default function RdpClaimBoard() {
  const router = useRouter();
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [myActive, setMyActive] = useState<MyActiveRdp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const loadMachines = useCallback(async () => {
    try {
      const [data, active] = await Promise.all([
        api.get<RDPResource[]>('/rdp'),
        getMyActiveRdp().catch(() => null),
      ]);
      setMachines(data);
      setMyActive(active);
    } catch {
      setMachines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMachines(); }, [loadMachines]);

  const handleClaim = async (machineId: string) => {
    setClaiming(machineId);
    setError(null);
    setInfo(null);
    try {
      const result = await claimRdp(machineId);
      if (result.guacamole_error && !result.guacamole_viewer_path) {
        setInfo(
          `Claimed, but remote desktop may not open: ${result.guacamole_error}`,
        );
      }
      router.push(`/worker/rdp-session/${machineId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to claim machine');
    } finally {
      setClaiming(null);
    }
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
            const isMine =
              myActive?.rdp_resource_id === m.id &&
              (m.status === 'assigned' || m.status === 'active');
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
                {m.status === 'online_free' ? (
                  <button
                    onClick={() => handleClaim(m.id)}
                    disabled={claiming === m.id || !!myActive}
                    className="btn-primary w-full text-sm disabled:opacity-50"
                    title={myActive ? 'End your current session before claiming another machine' : undefined}
                  >
                    {claiming === m.id ? 'Claiming…' : 'Claim'}
                  </button>
                ) : isMine ? (
                  <Link
                    href={`/worker/rdp-session/${m.id}`}
                    className="btn-primary w-full text-sm text-center block"
                  >
                    Open session
                  </Link>
                ) : m.status === 'assigned' || m.status === 'active' ? (
                  <p className="text-xs text-center text-theme-muted">In use by another worker</p>
                ) : (
                  <p className="text-xs text-center text-theme-muted capitalize">
                    {m.status.replace('_', ' ')}
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
