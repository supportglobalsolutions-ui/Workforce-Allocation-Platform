'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Power } from 'lucide-react';

import RdpViewer, { type RdpViewerHandle } from '@/components/rdp/RdpViewer';
import { api } from '@/lib/api';
import { endRdpConnection } from '@/lib/rdp';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
}

/** Dedicated full-screen tab for the remote desktop. */
export default function RdpDesktopPage({ params }: { params: { rdpId: string } }) {
  const rdpId = params.rdpId;
  const rdpRef = useRef<RdpViewerHandle>(null);
  const [machine, setMachine] = useState<RDPResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

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

  // Auto-enter browser fullscreen on load.
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const handleDisconnect = useCallback(async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    setShowMenu(false);
    try {
      rdpRef.current?.disconnect();
      await endRdpConnection(rdpId);
    } catch {
      // end anyway
    }
    sessionStorage.removeItem(`rdp-desktop-auto-${rdpId}`);
    window.close();
  }, [disconnecting, rdpId]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-theme-muted text-sm">
        Loading remote desktop…
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      {/* Backdrop to close menu when clicking outside */}
      {showMenu && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => { setShowMenu(false); setConfirming(false); }}
        />
      )}

      {/* Red disconnect button pinned to top-center */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30">
        <button
          type="button"
          onClick={() => { setShowMenu((v) => !v); setConfirming(false); }}
          className="flex items-center gap-1.5 rounded-b-lg px-4 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/50 transition-colors"
        >
          <Power size={12} />
          {machine?.nickname ?? 'Session'}
        </button>

        {showMenu && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-[#0d1117] border border-white/20 rounded-lg shadow-2xl overflow-hidden min-w-[200px]">
            {confirming ? (
              <div className="p-4 space-y-3">
                <p className="text-sm text-white font-medium">Disconnect session?</p>
                <p className="text-xs text-theme-muted">This will end the RDP connection and release the machine.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="flex-1 px-3 py-1.5 text-xs rounded-md border border-white/20 text-theme-muted hover:text-white hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex-1 px-3 py-1.5 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50 transition-colors"
                  >
                    {disconnecting ? 'Disconnecting…' : 'Yes, disconnect'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <Power size={15} />
                Disconnect session
              </button>
            )}
          </div>
        )}
      </div>

      <RdpViewer ref={rdpRef} rdpId={rdpId} className="h-full" />
    </div>
  );
}
