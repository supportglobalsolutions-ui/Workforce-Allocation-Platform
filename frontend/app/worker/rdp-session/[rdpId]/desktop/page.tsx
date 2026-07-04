'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

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
  const [bannerVisible, setBannerVisible] = useState(true);

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
      {bannerVisible ? (
        <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-white/10 bg-[#0d1117]">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {machine?.nickname ?? 'Remote desktop'}
            </p>
            <p className="text-xs text-theme-muted truncate">
              When you finish, use <strong>End Connection</strong> on the session page to release the machine, then close this tab.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBannerVisible(false)}
            title="Hide this bar"
            className="shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-theme-muted hover:text-white hover:bg-white/10"
          >
            <X size={14} />
            Hide
          </button>
        </header>
      ) : (
        <button
          type="button"
          onClick={() => setBannerVisible(true)}
          title="Show session info"
          className="absolute top-0 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1 rounded-b-md px-2.5 py-0.5 text-[10px] text-theme-muted bg-black/50 hover:bg-black/80 hover:text-white backdrop-blur-sm"
        >
          <ChevronDown size={12} />
          {machine?.nickname ?? 'Session'}
        </button>
      )}
      <div className="flex-1 min-h-0">
        <RdpViewer rdpId={rdpId} className="h-full" showControls />
      </div>
    </div>
  );
}
