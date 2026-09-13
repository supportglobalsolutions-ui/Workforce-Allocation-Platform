'use client';

import { useCallback, useEffect, useState } from 'react';
import { Maximize2, Minimize2, Power } from 'lucide-react';

import RdpViewer from '@/components/rdp/RdpViewer';
import { api } from '@/lib/api';
import { endRdpConnection, getMyActiveRdp } from '@/lib/rdp';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
}

function evidenceUrl(rdpId: string, sessionId?: string | null) {
  const q = new URLSearchParams({ evidence: '1', rdp: rdpId });
  if (sessionId) q.set('session', sessionId);
  return `/worker/session-history?${q.toString()}`;
}

/** Dedicated full-screen tab for the remote desktop. */
export default function RdpDesktopPage({ params }: { params: { rdpId: string } }) {
  const rdpId = params.rdpId;
  const [machine, setMachine] = useState<RDPResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Remote desktop';
    api.get<RDPResource>(`/rdp/${rdpId}`)
      .then((r) => { setMachine(r); document.title = `${r.nickname} — Remote desktop`; })
      .catch(() => setMachine(null))
      .finally(() => setLoading(false));
    getMyActiveRdp()
      .then((active) => {
        if (active?.rdp_resource_id === rdpId && active.session_id) {
          setSessionId(active.session_id);
        }
      })
      .catch(() => { /* ignore */ });
  }, [rdpId]);

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    onChange();
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* user denied or unsupported */
    }
  }, []);

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('rdp-events');
      ch.onmessage = (e) => {
        if (e.data?.type === 'session-ended' && e.data?.rdpId === rdpId) {
          if (e.data?.openedBy === 'desktop') return;
          const dest = e.data?.evidenceUrl || evidenceUrl(rdpId, e.data?.sessionId);
          window.close();
          setTimeout(() => {
            if (!window.closed) window.location.replace(dest);
          }, 150);
        }
      };
    } catch { /* ignore */ }
    return () => { try { ch?.close(); } catch { /* ignore */ } };
  }, [rdpId]);

  const leaveToEvidence = useCallback(async (sid?: string | null) => {
    sessionStorage.removeItem(`rdp-desktop-auto-${rdpId}`);
    let session = sid ?? sessionId;
    if (!session) {
      try {
        const active = await getMyActiveRdp();
        if (active?.rdp_resource_id === rdpId) session = active.session_id;
      } catch {
        session = null;
      }
    }
    const dest = evidenceUrl(rdpId, session);
    // Stay in this tab (already the extra window) so the evidence form is already open.
    window.location.replace(dest);
  }, [rdpId, sessionId]);

  const handleDisconnect = useCallback(() => {
    setShowMenu(false);
    setConfirming(false);
    const sid = sessionId;
    leaveToEvidence(sid);
    void endRdpConnection(rdpId).catch(() => { /* already left */ });
  }, [rdpId, sessionId, leaveToEvidence]);

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

      {/* Windowed: show the Global Solutions bar so the desktop reads as part of
          the platform. Full screen: nothing but the remote desktop. */}
      {!isFullscreen && (
        <div className="absolute top-0 inset-x-0 z-10 h-11 flex items-center gap-3 px-4 bg-[#0b1220] border-b border-white/10">
          <span className="font-bold text-sm text-white tracking-tight">
            Global<span className="text-emerald-accent">Solutions</span>
          </span>
          <span className="text-[11px] uppercase tracking-wide text-white/40">Remote desktop</span>
          {machine && (
            <span className="text-xs text-white/60">
              {machine.nickname} · {machine.country} · {machine.client_group}
            </span>
          )}
        </div>
      )}

      <div
        className={`absolute left-1/2 -translate-x-1/2 z-30 ${isFullscreen ? 'top-0' : 'top-11'}`}
      >
        <div className="flex items-stretch rounded-b-lg overflow-hidden shadow-lg shadow-black/60">
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Minimise (exit full screen)' : 'Maximise (full screen)'}
            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
            className="flex items-center px-3 py-1.5 text-white/80 hover:text-white bg-neutral-800/95 hover:bg-neutral-700 border-r border-white/10 transition-colors"
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            onClick={() => { setShowMenu((v) => !v); setConfirming(false); }}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors"
          >
            <Power size={12} />
            {machine?.nickname ?? 'Session'}
          </button>
        </div>

        {showMenu && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30">
            {confirming ? (
              <div className="w-[22rem] rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-red-900/40">
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
                        {' '}will be released. You will add start &amp; end images next.
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
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 shadow-md shadow-red-900/60 transition-colors"
                    >
                      Yes, disconnect
                    </button>
                  </div>
                </div>
              </div>
            ) : (
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

      {/* Sits below the Global Solutions bar when windowed, full-bleed when maximised. */}
      <div className={`absolute inset-x-0 bottom-0 ${isFullscreen ? 'top-0' : 'top-11'}`}>
        <RdpViewer rdpId={rdpId} className="h-full" onDisconnect={() => leaveToEvidence(sessionId)} />
      </div>
    </div>
  );
}
