'use client';

import { useCallback, useEffect, useState } from 'react';
import { Power } from 'lucide-react';

import RdpViewer from '@/components/rdp/RdpViewer';
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
  const [machine, setMachine] = useState<RDPResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    document.title = 'Remote desktop';
    api.get<RDPResource>(`/rdp/${rdpId}`)
      .then((r) => { setMachine(r); document.title = `${r.nickname} — Remote desktop`; })
      .catch(() => setMachine(null))
      .finally(() => setLoading(false));
  }, [rdpId]);

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  /** Close tab — called by both the red button and Guacamole's disconnect event. */
  const closeTab = useCallback(() => {
    sessionStorage.removeItem(`rdp-desktop-auto-${rdpId}`);
    try {
      const ch = new BroadcastChannel('rdp-events');
      ch.postMessage({ type: 'session-ended', rdpId });
      ch.close();
    } catch { /* ignore */ }
    window.close();
  }, [rdpId]);

  const handleDisconnect = useCallback(async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    setShowMenu(false);
    try { await endRdpConnection(rdpId); } catch { /* close anyway */ }
    closeTab();
  }, [disconnecting, rdpId, closeTab]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white/40 text-sm">
        Loading remote desktop…
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      {showMenu && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => { setShowMenu(false); setConfirming(false); }}
        />
      )}

      {/* ── Red pill ── */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30">
        <button
          type="button"
          onClick={() => { setShowMenu((v) => !v); setConfirming(false); }}
          className="flex items-center gap-1.5 rounded-b-lg px-4 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/60 transition-colors"
        >
          <Power size={12} />
          {machine?.nickname ?? 'Session'}
        </button>

        {showMenu && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30">
            {confirming ? (
              /* ── Confirmation modal ── */
              <div className="w-[22rem] rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-red-900/40">
                {/* top accent strip */}
                <div className="h-[3px] bg-gradient-to-r from-red-800 via-red-500 to-red-800" />
                <div className="bg-[#0f0808] px-6 pt-5 pb-6 space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 mt-0.5 w-10 h-10 rounded-full bg-red-500/10 ring-1 ring-red-500/40 flex items-center justify-center">
                      <Power size={18} className="text-red-500" />
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-white leading-snug">Disconnect session?</p>
                      <p className="mt-1 text-sm text-white/55 leading-relaxed">
                        <span className="text-white/80 font-medium">{machine?.nickname}</span>
                        {' '}will be released back to the pool.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white/60 bg-white/6 hover:bg-white/10 hover:text-white border border-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 shadow-md shadow-red-900/60 disabled:opacity-50 transition-colors"
                    >
                      {disconnecting ? 'Disconnecting…' : 'Yes, disconnect'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ── First-click item ── */
              <div className="rounded-xl overflow-hidden shadow-xl border border-red-900/30 bg-[#0f0808] min-w-[180px]">
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <Power size={15} />
                  Disconnect session
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pass closeTab so Guacamole's own disconnect event closes the tab instantly */}
      <RdpViewer rdpId={rdpId} className="h-full" onDisconnect={closeTab} />
    </div>
  );
}
