'use client';

import { useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { machines } from '@/lib/mock-data';

export default function RdpClaimBoard() {
  const [claimed, setClaimed] = useState<string | null>(null);

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {machines.map((m) => (
          <div key={m.id} className="glass-panel p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-mono text-theme-muted">{m.id}</p>
                <h3 className="text-base font-bold text-white">{m.name}</h3>
              </div>
              <StatusBadge status={m.status} />
            </div>
            <div className="flex justify-between text-xs text-theme-muted mb-4">
              <span>{m.country}</span>
              <span>{m.client}</span>
            </div>
            {m.status === 'online_free' ? (
              <button onClick={() => setClaimed(m.id)} className="btn-primary w-full text-sm">
                {claimed === m.id ? 'Claimed' : 'Claim'}
              </button>
            ) : (
              <p className="text-xs text-center text-theme-muted py-2">Unavailable</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
