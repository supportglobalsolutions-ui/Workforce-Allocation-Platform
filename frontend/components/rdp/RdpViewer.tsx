'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

import { getRdpTunnelInfo } from '@/lib/rdp';
import { auth } from '@/lib/firebase';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface RdpViewerProps {
  rdpId: string;
  className?: string;
  /** Show fullscreen toggle overlay (desktop window). */
  showControls?: boolean;
}

export default function RdpViewer({
  rdpId,
  className = '',
  showControls = false,
}: RdpViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const enterFullscreen = useCallback(async () => {
    try {
      await containerRef.current?.requestFullscreen();
    } catch {
      /* browser may block without user gesture */
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let client: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let keyboard: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mouse: any;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      try {
        const info = await getRdpTunnelInfo(rdpId);
        const Guacamole = (await import('guacamole-common-js')).default;

        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error('Not signed in.');

        // Extra headers ride along on every tunnel request (connect/read/write),
        // satisfying the API's Firebase Bearer auth.
        const tunnel = new Guacamole.HTTPTunnel(info.tunnel_url, false, {
          Authorization: `Bearer ${idToken}`,
        });
        client = new Guacamole.Client(tunnel);
        clientRef.current = client;

        const displayEl = client.getDisplay().getElement();
        if (displayRef.current) {
          displayRef.current.innerHTML = '';
          displayRef.current.appendChild(displayEl);
        }

        client.onstatechange = (state: number) => {
          if (!mounted) return;
          // 3 = CONNECTED, 4 = DISCONNECTING, 5 = DISCONNECTED
          if (state === 3) {
            setStatus('connected');
            setError(null);
          } else if (state === 5) {
            setStatus('disconnected');
          }
        };

        client.onerror = (err: { message?: string } | undefined) => {
          if (!mounted) return;
          setError(err?.message || 'Remote desktop connection failed.');
          setStatus('error');
        };

        // Scale remote display to fit the container.
        const fitDisplay = () => {
          const disp = client.getDisplay();
          const box = displayRef.current;
          if (!disp || !box) return;
          const dw = disp.getWidth();
          const dh = disp.getHeight();
          if (!dw || !dh) return;
          const scale = Math.min(box.clientWidth / dw, box.clientHeight / dh);
          if (scale > 0 && Number.isFinite(scale)) disp.scale(scale);
        };
        client.getDisplay().onresize = fitDisplay;
        if (displayRef.current) {
          resizeObserver = new ResizeObserver(fitDisplay);
          resizeObserver.observe(displayRef.current);
        }

        // Mouse input (scale coordinates back to remote resolution).
        mouse = new Guacamole.Mouse(displayEl);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sendMouse = (state: any) => {
          const scale = client.getDisplay().getScale() || 1;
          client.sendMouseState(
            new Guacamole.Mouse.State(
              state.x / scale,
              state.y / scale,
              state.left,
              state.middle,
              state.right,
              state.up,
              state.down,
            ),
          );
        };
        mouse.onmousedown = sendMouse;
        mouse.onmouseup = sendMouse;
        mouse.onmousemove = sendMouse;

        // Keyboard input.
        keyboard = new Guacamole.Keyboard(document);
        keyboard.onkeydown = (keysym: number) => client.sendKeyEvent(1, keysym);
        keyboard.onkeyup = (keysym: number) => client.sendKeyEvent(0, keysym);

        const box = displayRef.current;
        const width = Math.max(box?.clientWidth ?? window.innerWidth, 800);
        const height = Math.max(box?.clientHeight ?? window.innerHeight, 600);

        const connectData = new URLSearchParams({
          token: info.token,
          GUAC_DATA_SOURCE: info.data_source,
          GUAC_ID: info.connection_id,
          GUAC_TYPE: 'c',
          GUAC_WIDTH: String(Math.floor(width)),
          GUAC_HEIGHT: String(Math.floor(height)),
          GUAC_DPI: '96',
        });
        connectData.append('GUAC_IMAGE', 'image/png');
        connectData.append('GUAC_IMAGE', 'image/jpeg');

        client.connect(connectData.toString());
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to start remote session');
        setStatus('error');
      }
    })();

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      if (keyboard) {
        keyboard.onkeydown = null;
        keyboard.onkeyup = null;
      }
      if (mouse) {
        mouse.onmousedown = null;
        mouse.onmouseup = null;
        mouse.onmousemove = null;
      }
      try {
        client?.disconnect();
      } catch {
        /* ignore cleanup errors */
      }
      clientRef.current = null;
    };
  }, [rdpId]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black overflow-hidden ${className}`}
    >
      {showControls && (
        <div className="absolute top-2 right-2 z-20">
          {isFullscreen ? (
            <button
              type="button"
              onClick={exitFullscreen}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white bg-black/60 hover:bg-black/80 backdrop-blur-sm"
            >
              <Minimize2 size={14} />
              Exit full screen
            </button>
          ) : (
            <button
              type="button"
              onClick={enterFullscreen}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-emerald-accent bg-black/60 hover:bg-black/80 backdrop-blur-sm"
            >
              <Maximize2 size={14} />
              Full screen
            </button>
          )}
        </div>
      )}

      <div ref={displayRef} className="w-full h-full min-h-[480px]" />

      {status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-theme-muted text-sm pointer-events-none">
          Connecting to remote desktop…
        </div>
      )}
      {status === 'disconnected' && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-theme-muted text-sm p-6 text-center">
          Session disconnected. You can close this tab.
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-danger text-sm p-6 text-center">
          {error}
        </div>
      )}
    </div>
  );
}
