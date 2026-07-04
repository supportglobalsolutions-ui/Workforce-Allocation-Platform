'use client';

import { useCallback, useEffect, useState } from 'react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
  status: string;
  guacamole_connection_id: string | null;
}

interface ClaimResult {
  allocation_id: string;
  rdp_resource_id: string;
  worker_id: string;
  status: string;
  guacamole_url: string | null;
  guacamole_error?: string | null;
}

export default function RdpClaimBoard() {
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);

  const loadMachines = useCallback(async () => {
    try {
      const data = await api.get<RDPResource[]>('/rdp');
      setMachines(data);
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
    // Open the tab synchronously (inside the click event) so the browser
    // doesn't block it as a popup. Show a loading screen immediately so
    // the user never sees a blank tab or a bare URL.
    const tab = window.open('', '_blank');
    if (tab) {
      tab.document.write(
        '<!DOCTYPE html><html><head><title>Opening session…</title>' +
        '<style>body{margin:0;background:#0d1117;color:#6ee7b7;font-family:sans-serif;' +
        'display:flex;align-items:center;justify-content:center;height:100vh;font-size:1rem;}</style>' +
        '</head><body>Opening remote session…</body></html>'
      );
      tab.document.close();
    }
    try {
      const result = await api.post<ClaimResult>(`/rdp/${machineId}/claim`, {});
      await loadMachines();
      if (result.guacamole_url && tab) {
        tab.location.href = result.guacamole_url;
        setInfo('Claimed — remote session opened in a new tab.');
      } else {
        tab?.close();
        setInfo(
          `Claimed, but no remote session opened. ${result.guacamole_error ?? 'No Guacamole URL returned.'}`,
        );
      }
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : 'Failed to claim machine');
    } finally {
      setClaiming(null);
    }
  };

  const handleRelease = async (machineId: string) => {
    setReleasing(machineId);
    setError(null);
    setInfo(null);
    try {
      await api.post(`/rdp/${machineId}/release`, {});
      await loadMachines();
      setInfo('Released — machine is available to claim again.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to release machine');
    } finally {
      setReleasing(null);
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
          {machines.map((m) => (
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
                  disabled={claiming === m.id}
                  className="btn-primary w-full text-sm disabled:opacity-50"
                >
                  {claiming === m.id ? 'Claiming…' : 'Claim'}
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-center text-theme-muted">Unavailable</p>
                  <button
                    onClick={() => handleRelease(m.id)}
                    disabled={releasing === m.id}
                    className="btn-secondary w-full text-xs disabled:opacity-50"
                  >
                    {releasing === m.id ? 'Releasing…' : 'Release'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
