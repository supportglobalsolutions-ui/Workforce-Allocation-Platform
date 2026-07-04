'use client';

import { useEffect, useRef, useState } from 'react';

import { getRdpTunnelInfo } from '@/lib/rdp';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface RdpViewerProps {
  rdpId: string;
  className?: string;
}

export default function RdpViewer({ rdpId, className = '' }: RdpViewerProps) {
  const displayRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);

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
    <div className={`relative w-full bg-black overflow-hidden ${className}`}>
      <div ref={displayRef} className="w-full h-full min-h-[480px]" />
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
