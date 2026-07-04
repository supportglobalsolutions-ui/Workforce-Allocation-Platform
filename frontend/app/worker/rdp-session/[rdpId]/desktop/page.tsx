'use client';

import { useEffect, useState } from 'react';

import RdpViewer from '@/components/rdp/RdpViewer';
import { api } from '@/lib/api';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
}

/** Dedicated window/tab for the remote desktop — minimal chrome, full viewport. */
export default function RdpDesktopPage({ params }: { params: { rdpId: string } }) {
  const rdpId = params.rdpId;
  const [machine, setMachine] = useState<RDPResource | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Remote desktop';
    api.get<RDPResource>(`/rdp/${rdpId}`)
      .then((r) => {
        setMachine(r);
        document.title = `${r.nickname} — Remote desktop`;
      })
      .catch(() => setMachine(null))
      .finally(() => setLoading(false));
  }, [rdpId]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-theme-muted text-sm">
        Loading remote desktop…
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      <header className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#0d1117]">
        <div>
          <p className="text-sm font-semibold text-white">{machine?.nickname ?? 'Remote desktop'}</p>
          <p className="text-xs text-theme-muted">
            Close this tab when done — use End Connection on the session page to release the machine.
          </p>
        </div>
      </header>
      <div className="flex-1 min-h-0">
        <RdpViewer rdpId={rdpId} className="h-full" showControls />
      </div>
    </div>
  );
}
