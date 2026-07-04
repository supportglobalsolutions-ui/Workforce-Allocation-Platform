'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { auth } from '@/lib/firebase';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RdpViewerHandle {
  disconnect: () => void;
}

interface RdpViewerProps {
  rdpId: string;
  className?: string;
  /** Called when the Guacamole connection reaches state DISCONNECTED. Parent can close the window or navigate. */
  onDisconnect?: () => void;
}

const RdpViewer = forwardRef<RdpViewerHandle, RdpViewerProps>(function RdpViewer(
  { rdpId, className = '', onDisconnect },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    disconnect: () => {
      try { clientRef.current?.disconnect(); } catch { /* ignore */ }
    },
  }));

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
        // Fetch Guacamole module and Firebase token in parallel.
        const [Guacamole, idToken] = await Promise.all([
          import('guacamole-common-js').then((m) => m.default),
          auth.currentUser
            ? auth.currentUser.getIdToken()
            : Promise.reject(new Error('Not signed in.')),
        ]);

        // Build WS URL: backend proxies to Guacamole, keeping the Guacamole
        // auth token server-side. Only the Firebase ID token crosses the wire.
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
        const wsBase = apiUrl.replace(/^http/, 'ws');
        const wsTunnelUrl = `${wsBase}/rdp/${rdpId}/ws-tunnel`;

        const tunnel = new Guacamole.WebSocketTunnel(wsTunnelUrl);
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
            onDisconnect?.();
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

        // guacamole-common-js WebSocketTunnel appends connect data as a query string.
        // The backend strips firebaseToken before forwarding to Guacamole.
        const connectData = new URLSearchParams({
          firebaseToken: idToken,
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
      <div ref={displayRef} className="w-full h-full min-h-[480px]" />

      {status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-theme-muted text-sm pointer-events-none">
          Connecting to remote desktop…
        </div>
      )}
      {status === 'disconnected' && !error && !onDisconnect && (
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
});

export default RdpViewer;
