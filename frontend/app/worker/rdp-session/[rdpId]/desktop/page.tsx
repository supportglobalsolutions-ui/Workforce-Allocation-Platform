'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Power,
} from 'lucide-react';

import ConfirmModal from '@/components/platform/ConfirmModal';
import RdpViewer, { type RdpViewerHandle } from '@/components/rdp/RdpViewer';
import { api } from '@/lib/api';
import { reportError, reportWarning } from '@/lib/errors';
import {
  broadcastRdpSessionEnded,
  endRdpConnectionSafe,
  getMyActiveRdp,
  sessionEvidenceUrl,
} from '@/lib/rdp';
import {
  MAX_SESSION_IMAGES,
  captureDisplayFrame,
  uploadSessionImageBlob,
} from '@/lib/session-images';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
}

type DisconnectPhase = 'idle' | 'confirm' | 'disconnecting';

function evidenceUrl(rdpId: string, sessionId?: string | null) {
  return sessionEvidenceUrl(rdpId, sessionId);
}

/** Dedicated full-screen tab for the remote desktop. */
export default function RdpDesktopPage({ params }: { params: { rdpId: string } }) {
  const rdpId = params.rdpId;
  const viewerRef = useRef<RdpViewerHandle>(null);
  const [machine, setMachine] = useState<RDPResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [disconnectPhase, setDisconnectPhase] = useState<DisconnectPhase>('idle');
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureNote, setCaptureNote] = useState<string | null>(null);
  const [shotCount, setShotCount] = useState(0);
  const [endError, setEndError] = useState<string | null>(null);
  /** Start collapsed so remote Chrome tabs stay clickable; expand on demand. */
  const [chromeHidden, setChromeHidden] = useState(true);
  /** Floating chrome position (px from top-left). null = centered at top. */
  const [chromePos, setChromePos] = useState<{ x: number; y: number } | null>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const clampChromePos = useCallback((x: number, y: number) => {
    const el = chromeRef.current;
    const w = el?.offsetWidth ?? 48;
    const h = el?.offsetHeight ?? 36;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    return {
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y), maxY),
    };
  }, []);

  /** Drag only from the red ↓/↑ handles — never steal RDP clicks elsewhere. */
  const onDragHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const handle = e.currentTarget;
      const el = chromeRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const state = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: rect.left,
        origY: rect.top,
        moved: false,
      };
      dragRef.current = state;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== state.pointerId) return;
        const dx = ev.clientX - state.startX;
        const dy = ev.clientY - state.startY;
        if (!state.moved && Math.hypot(dx, dy) < 8) return;
        if (!state.moved) {
          state.moved = true;
          try {
            handle.setPointerCapture(ev.pointerId);
          } catch { /* ignore */ }
        }
        setChromePos(clampChromePos(state.origX + dx, state.origY + dy));
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== state.pointerId) return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        dragRef.current = null;
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch { /* ignore */ }
        if (!state.moved) {
          setChromeHidden((h) => !h);
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [clampChromePos],
  );


  const tabIdRef = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `tab-${Date.now()}`,
  );

  useEffect(() => {
    document.title = 'Remote desktop';
    api.get<RDPResource>(`/rdp/${rdpId}`)
      .then((r) => {
        setMachine(r);
        document.title = `${r.nickname} — Remote desktop`;
      })
      .catch((e) => {
        reportWarning('Load desktop machine', e, { rdpId });
        setMachine(null);
      })
      .finally(() => setLoading(false));
    getMyActiveRdp()
      .then((active) => {
        if (active?.rdp_resource_id === rdpId && active.session_id) {
          setSessionId(active.session_id);
        }
      })
      .catch(() => { /* ignore */ });
  }, [rdpId]);

  // Know whether start/end shots already exist so a second capture can warn.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    api.get<{ image_urls?: string[] | null }>(`/sessions/${sessionId}`)
      .then((s) => {
        if (cancelled) return;
        setShotCount((s.image_urls ?? []).length);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
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

  const leaveToHistory = useCallback(async (sid?: string | null) => {
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
    window.location.replace(evidenceUrl(rdpId, session));
  }, [rdpId, sessionId]);

  const closeThisTabQuietly = useCallback(() => {
    sessionStorage.removeItem(`rdp-desktop-auto-${rdpId}`);
    try { viewerRef.current?.disconnect(); } catch { /* ignore */ }
    window.close();
    // Pop-up tabs can usually close; if not, blank this tab — do not open
    // history here (the tab that ended owns that navigation).
    window.setTimeout(() => {
      if (!window.closed) {
        window.location.replace('about:blank');
      }
    }, 150);
  }, [rdpId]);

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('rdp-events');
      ch.onmessage = (e) => {
        if (e.data?.rdpId !== rdpId) return;
        if (e.data?.fromTabId === tabIdRef.current) return;
        // Other tab ended or took over — close silently (no prompt).
        if (e.data?.type === 'session-ended' || e.data?.type === 'session-moved') {
          closeThisTabQuietly();
        }
      };
    } catch { /* ignore */ }
    return () => { try { ch?.close(); } catch { /* ignore */ } };
  }, [closeThisTabQuietly, rdpId]);

  const finishDisconnect = useCallback(async () => {
    setDisconnectPhase('disconnecting');
    setEndError(null);
    const sid = sessionId;
    try {
      viewerRef.current?.disconnect();
    } catch { /* ignore */ }

    // Notify the control / claim-board tab immediately so they stop showing Live.
    broadcastRdpSessionEnded({
      rdpId,
      sessionId: sid,
      evidenceUrl: evidenceUrl(rdpId, sid),
      openedBy: 'desktop',
      fromTabId: tabIdRef.current,
    });

    const result = await endRdpConnectionSafe(rdpId);
    if (!result.ok) {
      const msg = reportError('End RDP connection', result.error, { rdpId });
      const raw = result.error instanceof Error ? result.error.message : String(result.error);
      if (!raw.toLowerCase().includes('already') && !raw.toLowerCase().includes('no longer')) {
        setEndError(msg);
        setDisconnectPhase('idle');
        return;
      }
    }

    window.setTimeout(() => {
      void leaveToHistory(sid);
    }, 400);
  }, [leaveToHistory, rdpId, sessionId]);

  const runCapture = useCallback(async () => {
    if (!sessionId) {
      setCaptureNote('Session still starting — try again in a moment.');
      return;
    }
    if (shotCount >= MAX_SESSION_IMAGES) {
      setCaptureNote(`All ${MAX_SESSION_IMAGES} screenshots used for this session.`);
      return;
    }
    setCaptureBusy(true);
    setCaptureNote(null);
    try {
      let blob = await viewerRef.current?.captureRemoteFrame() ?? null;
      if (!blob) blob = await captureDisplayFrame();
      if (!blob) {
        setCaptureNote('Capture cancelled.');
        return;
      }
      // The server owns the cap and returns the authoritative list, so a
      // second tab capturing at the same time cannot push this past 8.
      const result = await uploadSessionImageBlob(sessionId, blob);
      setShotCount(result.image_urls.length);
      setCaptureNote(
        `Screenshot ${result.image_urls.length} of ${result.max_images} saved.`,
      );
    } catch (err) {
      setCaptureNote(reportError('Capture session evidence', err, { rdpId }));
    } finally {
      setCaptureBusy(false);
    }
  }, [rdpId, sessionId, shotCount]);

  const notifyTakeover = useCallback(() => {
    try {
      const ch = new BroadcastChannel('rdp-events');
      ch.postMessage({
        type: 'session-moved',
        rdpId,
        fromTabId: tabIdRef.current,
      });
      ch.close();
    } catch { /* ignore */ }
  }, [rdpId]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white/50 text-sm">
        Loading remote desktop…
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      {/* pointer-events-none on the shell so the RDP canvas stays clickable;
          only the visible buttons re-enable hits. Drag only from ↓/↑. */}
      <div
        ref={chromeRef}
        className="absolute z-30 flex flex-col items-center pointer-events-none"
        style={
          chromePos
            ? { left: chromePos.x, top: chromePos.y }
            : { left: '50%', top: 0, transform: 'translateX(-50%)' }
        }
      >
        {chromeHidden ? (
          <button
            type="button"
            data-chrome-drag
            onPointerDown={onDragHandlePointerDown}
            title="Show controls — click to open, drag to move"
            aria-label="Show controls"
            className="pointer-events-auto flex items-center justify-center rounded-b-lg px-3 py-2 text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-black/50 border border-white/10 border-t-0 cursor-grab active:cursor-grabbing touch-none select-none"
          >
            <ChevronDown size={16} strokeWidth={2.5} className="text-white pointer-events-none" />
          </button>
        ) : (
          <>
            <div className="pointer-events-auto flex items-stretch rounded-b-xl overflow-hidden shadow-lg shadow-black/60 border border-white/10 border-t-0">
              <button
                type="button"
                onClick={() => void runCapture()}
                disabled={
                  captureBusy
                  || disconnectPhase !== 'idle'
                  || shotCount >= MAX_SESSION_IMAGES
                }
                title={
                  shotCount >= MAX_SESSION_IMAGES
                    ? `All ${MAX_SESSION_IMAGES} screenshots used`
                    : `Capture screenshot (${shotCount}/${MAX_SESSION_IMAGES})`
                }
                aria-label={`Capture screenshot, ${shotCount} of ${MAX_SESSION_IMAGES} used`}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-600 border-r border-red-900/50 transition-colors disabled:opacity-40"
              >
                <Camera size={13} className="text-white pointer-events-none" />
                {captureBusy ? 'Saving…' : `${shotCount}/${MAX_SESSION_IMAGES}`}
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit full screen' : 'Full screen'}
                aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-600 border-r border-red-900/50 transition-colors"
              >
                {isFullscreen
                  ? <Minimize2 size={13} className="text-white pointer-events-none" />
                  : <Maximize2 size={13} className="text-white pointer-events-none" />}
                {isFullscreen ? 'Exit' : 'Full'}
              </button>
              <button
                type="button"
                onClick={() => setDisconnectPhase('confirm')}
                disabled={disconnectPhase !== 'idle'}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 border-r border-red-800/40 transition-colors disabled:opacity-60"
              >
                <Power size={13} className="text-white pointer-events-none" />
                {disconnectPhase === 'disconnecting' ? 'Ending…' : 'Disconnect'}
              </button>
              <button
                type="button"
                data-chrome-drag
                onPointerDown={onDragHandlePointerDown}
                title="Hide controls — click to hide, drag to move"
                aria-label="Hide controls"
                className="flex items-center justify-center px-3 py-2 text-white bg-red-600 hover:bg-red-500 transition-colors cursor-grab active:cursor-grabbing touch-none select-none"
              >
                <ChevronUp size={16} strokeWidth={2.5} className="text-white pointer-events-none" />
              </button>
            </div>
            {captureNote && (
              <p className="pointer-events-none mt-2 px-3 py-1 rounded-full bg-black/70 text-center text-xs font-medium text-emerald-300">
                {captureNote}
              </p>
            )}
          </>
        )}
      </div>

      <div className="absolute inset-0">
        <RdpViewer
          ref={viewerRef}
          rdpId={rdpId}
          className="h-full"
          onTakeover={notifyTakeover}
          onDisconnect={
            disconnectPhase === 'idle'
              ? () => { closeThisTabQuietly(); }
              : undefined
          }
        />
      </div>

      {/* One clear end dialog — then session history opens for images. */}
      {disconnectPhase === 'confirm' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-red-900/40 bg-[#0f0808]">
            <div className="h-[3px] bg-gradient-to-r from-red-800 via-red-500 to-red-800" />
            <div className="px-6 pt-5 pb-6 space-y-4">
              <p className="text-[15px] font-bold text-white">End this session?</p>
              <p className="text-sm text-white/60 leading-relaxed">
                {machine?.nickname ? (
                  <>
                    <span className="text-white/90 font-medium">{machine.nickname}</span>
                    {' '}will disconnect. Next you can add or check screenshots in session history.
                  </>
                ) : (
                  'The desktop will disconnect. Next you can add or check screenshots in session history.'
                )}
              </p>
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setDisconnectPhase('idle')}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white/70 bg-white/8 hover:bg-white/12 border border-white/10"
                >
                  Keep working
                </button>
                <button
                  type="button"
                  onClick={() => void finishDisconnect()}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500"
                >
                  End session
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {disconnectPhase === 'disconnecting' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
          <p className="text-sm font-medium text-white">Ending session…</p>
        </div>
      )}

      {endError && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md rounded-xl bg-red-950/90 border border-red-500/40 px-4 py-3 text-sm text-red-100">
          {endError}
        </div>
      )}

    </div>
  );
}
