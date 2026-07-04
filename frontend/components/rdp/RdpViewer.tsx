'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

import { getRdpTunnelInfo } from '@/lib/rdp';

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

    (async () => {
      try {
        const info = await getRdpTunnelInfo(rdpId);
        const Guacamole = (await import('guacamole-common-js')).default;

        const tunnelUrl =
          `${info.tunnel_url}?connect=${encodeURIComponent(info.connect)}` +
          `&token=${encodeURIComponent(info.token)}`;
        const tunnel = new Guacamole.HTTPTunnel(tunnelUrl);
        client = new Guacamole.Client(tunnel);
        clientRef.current = client;

        if (displayRef.current) {
          displayRef.current.innerHTML = '';
          displayRef.current.appendChild(client.getDisplay().getElement());
        }

        client.onstatechange = (state: number) => {
          if (!mounted) return;
          if (state === Guacamole.Client.State.CONNECTED) {
            setStatus('connected');
            setError(null);
          } else if (state === Guacamole.Client.State.DISCONNECTED) {
            setStatus('disconnected');
          }
        };

        client.onerror = () => {
          if (!mounted) return;
          setError('Remote desktop connection failed.');
          setStatus('error');
        };

        client.connect();
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to start remote session');
        setStatus('error');
      }
    })();

    return () => {
      mounted = false;
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
        <div
          className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-end gap-2 px-3 py-2 bg-black/70 backdrop-blur-sm border-b border-white/10 transition-opacity ${
            isFullscreen ? 'opacity-100' : 'opacity-90 hover:opacity-100'
          }`}
        >
          {isFullscreen ? (
            <button
              type="button"
              onClick={exitFullscreen}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20"
            >
              <Minimize2 size={14} />
              Exit full screen
            </button>
          ) : (
            <button
              type="button"
              onClick={enterFullscreen}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white bg-emerald-accent/20 hover:bg-emerald-accent/30 text-emerald-accent"
            >
              <Maximize2 size={14} />
              Full screen
            </button>
          )}
        </div>
      )}

      <div
        ref={displayRef}
        className={`w-full h-full min-h-[480px] ${showControls ? 'pt-10' : ''}`}
      />

      {status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-theme-muted text-sm">
          Connecting to remote desktop…
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
