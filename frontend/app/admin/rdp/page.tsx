'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';
import { forceReleaseRdp, lockRdp, maintenanceRdp, unlockRdp } from '@/lib/rdp';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
  status: string;
  assigned_worker_id: string | null;
  health_notes: string | null;
}

export default function RdpManagementPage() {
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [forceReason, setForceReason] = useState<Record<string, string>>({});

  const reload = () =>
    api.get<RDPResource[]>('/rdp').then(setMachines).catch((e) => {
      setError(e instanceof Error ? e.message : 'Failed to load machines');
    });

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="RDP Resource Management"
        description="Control all machines — status, maintenance mode, lock, force release, and health monitoring."
      />
      <FilterBar
        searchPlaceholder="Search machines..."
        filters={[
          { label: 'Status', options: ['Online Free', 'Active', 'Maintenance', 'Locked'] },
          { label: 'Country', options: ['Kenya', 'Nigeria', 'Uganda', 'Ghana'] },
        ]}
      />
      {error && <p className="text-danger text-sm mb-4">{error}</p>}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : machines.length === 0 ? (
        <div className="glass-panel p-8 text-center text-brand-on-surface-variant text-sm">
          No RDP machines configured yet. Add machines to manage status, maintenance, and force release.
        </div>
      ) : (
        <div className="space-y-3">
          {machines.map((m) => (
            <div key={m.id} className="glass-panel p-4 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-xs text-brand-on-surface-variant">{m.id.slice(0, 8)}…</span>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="font-bold text-white">{m.nickname}</p>
                  <p className="text-xs text-brand-on-surface-variant">
                    {m.country} · {m.client_group}
                    {m.health_notes ? ` · ${m.health_notes}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.status === 'admin_locked' ? (
                    <button
                      type="button"
                      disabled={busyId === m.id}
                      onClick={() => runAction(m.id, () => unlockRdp(m.id))}
                      className="btn-secondary text-xs py-1.5"
                    >
                      Unlock
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === m.id}
                      onClick={() => runAction(m.id, () => lockRdp(m.id))}
                      className="btn-secondary text-xs py-1.5"
                    >
                      Lock
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === m.id || m.status === 'maintenance'}
                    onClick={() => runAction(m.id, () => maintenanceRdp(m.id))}
                    className="btn-secondary text-xs py-1.5"
                  >
                    Maintenance
                  </button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                  type="text"
                  placeholder="Force release reason (required)"
                  value={forceReason[m.id] ?? ''}
                  onChange={(e) => setForceReason((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-theme-muted"
                />
                <button
                  type="button"
                  disabled={busyId === m.id || !(forceReason[m.id] ?? '').trim()}
                  onClick={() =>
                    runAction(m.id, () => forceReleaseRdp(m.id, (forceReason[m.id] ?? '').trim()))
                  }
                  className="btn-secondary text-xs py-2 border-danger/30 text-danger shrink-0"
                >
                  Force Release
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
