'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { reportError, reportWarning } from '@/lib/errors';
import { createJoinTicket, getDesktopGuard } from '@/lib/rdp';

type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

/**
 * How many times an unattended drop is retried before we give up and end the
 * session (Phase 8 Action 4).
 *
 * Sized against the 5-minute disconnect grace, not picked for feel. With full
 * jitter at base 1s / cap 30s the ceilings are 1,2,4,8,16,30,30,30 s, so the
 * worst case is ~121s of waiting and the average is ~60s — both comfortably
 * inside `RDP_DISCONNECT_GRACE_SECONDS=300`, which is the window the server is
 * holding the machine open for. Exhausting the budget well before the grace
 * expires means the worker gets a clear ending rather than a tab that hangs
 * until the coordinator releases their desktop underneath them.
 */
const MAX_RECONNECT_ATTEMPTS = 8;

export interface RdpViewerHandle {
  disconnect: () => void;
  /** Snapshot the remote canvas (Guacamole Display.flatten), or null if not ready. */
  captureRemoteFrame: () => Promise<Blob | null>;
}

interface RdpViewerProps {
  rdpId: string;
  className?: string;
  /** Called when the Guacamole connection reaches state DISCONNECTED. Parent can close the window or navigate. */
  onDisconnect?: () => void;
  /** Fired once after a successful Switch-here connect so other tabs can close. */
  onTakeover?: () => void;
}

/** A live Guacamole session minted from a join ticket (Phase 5 direct gateway). */
interface GatewayAuth {
  token: string;
  dataSource: string;
  connectionName: string;
  guacOrigin: string;
  /** Seconds until this token should be quietly replaced. */
  refreshIn: number;
}

/** The server asked us to wait — how long, in ms, if it said. */
function retryAfterMs(error: unknown): number | null {
  const status = (error as { status?: number })?.status;
  if (status !== 503) return null;
  const header = (error as { headers?: Headers })?.headers?.get?.('retry-after');
  const seconds = header ? Number(header) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000;
}

/**
 * Wait before retrying, with **full jitter**.
 *
 * A media node restart drops every tunnel it held at the same instant. Plain
 * exponential backoff keeps the whole fleet synchronised — they all wait the
 * same 1s, 2s, 4s and hit guacd together, just less often. Randomising across
 * the *whole* interval is what actually spreads the herd.
 */
function backoffDelayMs(attempt: number, base = 1000, cap = 30_000): number {
  const ceiling = Math.min(cap, base * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Trade a single-use join ticket for a Guacamole token scoped to one machine.
 *
 * Returns null when this worker is outside the rollout cohort — the caller
 * then keeps the legacy FastAPI ws-tunnel. Throws only on a real failure.
 */
async function mintGatewayAuth(rdpId: string): Promise<GatewayAuth | null> {
  const pass = await createJoinTicket(rdpId);
  if (pass.mode !== 'direct' || !pass.ticket || !pass.auth_data || !pass.guacamole_url) {
    return null;
  }

  // The ticket rides in the query string so the POST stays a CORS-safelisted
  // request (no preflight): Nginx checks it with auth_request before
  // Guacamole ever sees the body, and redeeming it burns it.
  const mintUrl = `${pass.guacamole_url}/api/tokens?rdp_ticket=${encodeURIComponent(pass.ticket)}`;
  const response = await fetch(mintUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: pass.auth_data }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Guacamole rejected the join ticket (HTTP ${response.status})`);
  }

  const minted = await response.json();
  if (!minted?.authToken) throw new Error('Guacamole returned no auth token');
  return {
    token: minted.authToken,
    dataSource: minted.dataSource || pass.data_source || 'json',
    connectionName: pass.connection_name || '',
    guacOrigin: pass.guacamole_url,
    refreshIn: pass.refresh_in ?? 480,
  };
}

/**
 * Mint with backoff, so a gateway restart does not stampede (Phase 8 Action 4).
 *
 * Retrying matters here beyond politeness: falling straight through to the
 * proxy tunnel on the first hiccup would quietly move the entire fleet back
 * into Python — the exact thing Phase 5 exists to stop. We only give up after
 * the gateway has had several spaced-out chances. `abort()` lets an unmounting
 * viewer stop waiting.
 */
async function mintGatewayAuthWithBackoff(
  rdpId: string,
  attempts: number,
  abort: () => boolean,
): Promise<GatewayAuth | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (abort()) return null;
    try {
      return await mintGatewayAuth(rdpId);
    } catch (e) {
      lastError = e;
      if (attempt === attempts - 1) break;
      // Honour an explicit server hint, otherwise back off with full jitter.
      const hinted = retryAfterMs(e);
      await sleep(hinted ?? backoffDelayMs(attempt));
    }
  }
  throw lastError;
}

const RdpViewer = forwardRef<RdpViewerHandle, RdpViewerProps>(function RdpViewer(
  { rdpId, className = '', onDisconnect, onTakeover },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  /** Second-tab takeover: bump connection_generation server-side before reconnecting. */
  const [takeover, setTakeover] = useState(false);
  const [switchPrompt, setSwitchPrompt] = useState(false);
  const [connectFailures, setConnectFailures] = useState(0);
  /**
   * Bumping this re-runs the connect effect: the Guacamole client and tunnel
   * are rebuilt while the component — and the canvas container — stay mounted.
   * That is what a reconnect *is*; the old socket is gone either way.
   */
  const [reconnectNonce, setReconnectNonce] = useState(0);
  /** How many unattended reconnects we have burned on this drop. */
  const reconnectAttemptRef = useRef(0);
  /**
   * True when *we* pulled the tunnel down — End session, Switch here, or
   * unmount. Without this, a deliberate disconnect is indistinguishable from
   * a media node dying, and we would "reconnect" a worker who just left.
   */
  const intentionalCloseRef = useRef(false);

  useImperativeHandle(ref, () => ({
    disconnect: () => {
      intentionalCloseRef.current = true;
      try { clientRef.current?.disconnect(); } catch { /* ignore */ }
    },
    captureRemoteFrame: async () => {
      try {
        const client = clientRef.current;
        if (!client) return null;
        const display = client.getDisplay?.();
        if (!display?.flatten) return null;
        const canvas: HTMLCanvasElement | undefined = display.flatten();
        if (!canvas?.toBlob) return null;
        return await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
        });
      } catch {
        return null;
      }
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
    let resizeFrame: number | null = null;
    let resizeRemote: (() => void) | null = null;
    let connectionTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // A reconnect keeps saying "Reconnecting…" — flipping back to "Connecting"
    // would read to the worker as a brand-new session rather than the one they
    // are waiting to get back.
    const isReconnect = reconnectAttemptRef.current > 0;
    setStatus(isReconnect ? 'reconnecting' : 'connecting');
    setError(null);
    setSwitchPrompt(false);
    // A fresh attempt is not an intentional teardown; the flag only survives
    // long enough to suppress the reconnect for the drop it was set for.
    intentionalCloseRef.current = false;

    const noteAlreadyOpen = (message?: string, closeCode?: number) => {
      const text = (message || '').toLowerCase();
      const byCode = closeCode === 4409;
      const byText =
        text.includes('already open') ||
        text.includes('another tab') ||
        text.includes('switch here');
      if (byCode || byText) {
        setSwitchPrompt(true);
        setError(
          'This desktop is already open in another tab. Switch here to move the session, or return to that tab.',
        );
        setStatus('error');
        return true;
      }
      return false;
    };

    (async () => {
      try {
        // Fetch Guacamole module and Supabase token in parallel.
        const [Guacamole, sessionData] = await Promise.all([
          import('guacamole-common-js').then((m) => m.default),
          supabase.auth.getSession(),
        ]);

        // A tab opened via window.open can mount before Supabase has rehydrated
        // its session from localStorage. Wait briefly for the session to appear
        // instead of declaring the worker signed out.
        let idToken = sessionData.data.session?.access_token;
        if (!idToken) {
          idToken = await new Promise<string | undefined>((resolve) => {
            const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
              if (s?.access_token) {
                sub.subscription.unsubscribe();
                clearTimeout(timer);
                resolve(s.access_token);
              }
            });
            const timer = setTimeout(async () => {
              sub.subscription.unsubscribe();
              const { data } = await supabase.auth.getSession();
              resolve(data.session?.access_token);
            }, 4000);
          });
        }
        if (!idToken) throw new Error('Not signed in.');

        // Show Switch here immediately when another tab already holds the
        // tunnel. The WebSocket path still enforces the lock; this avoids a
        // 20s Connecting… hang when Guacamole's active list is empty.
        if (!takeover) {
          try {
            const guard = await getDesktopGuard(rdpId);
            if (!mounted) return;
            if (guard.already_open) {
              noteAlreadyOpen(guard.message || 'already open');
              return;
            }
          } catch (e) {
            reportWarning('Remote desktop guard', e, { rdpId });
          }
        }

        // Phase 5: ask the control plane for a pass to the media plane. A
        // worker in the rollout cohort gets pixels straight from Guacamole,
        // so an API deploy no longer kills their desktop. Everyone else —
        // and any gateway hiccup — falls back to the proxied tunnel rather
        // than failing the connect.
        let gateway: GatewayAuth | null = null;
        try {
          // Phase 8 Action 4: retry with jittered backoff before giving up. A
          // gateway restart drops every tunnel at once, and falling through on
          // the first failure would put the whole fleet back on the proxy path.
          gateway = await mintGatewayAuthWithBackoff(rdpId, 6, () => !mounted);
        } catch (e) {
          reportWarning('Remote desktop gateway', e, {
            rdpId,
            hint: 'Gateway did not answer after several attempts — falling back to the proxied ws-tunnel.',
          });
          gateway = null;
        }
        if (!mounted) return;

        // Vercel rewrites normal HTTP requests, but it does not proxy long-lived
        // WebSocket connections. Development keeps its existing same-origin
        // Next proxy; production connects directly to the API origin.
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        const wsTunnelUrl = gateway
          ? `${gateway.guacOrigin.replace(/^http/, 'ws')}/websocket-tunnel`
          : isLocal
            ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/rdp/${rdpId}/ws-tunnel`
            : (() => {
                const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL || window.location.origin);
                return `${apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${apiUrl.host}/rdp/${rdpId}/ws-tunnel`;
              })();

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
            if (connectionTimer) clearTimeout(connectionTimer);
            // A frame arrived: this drop is over, so the next one starts its
            // budget from scratch rather than inheriting a spent one.
            reconnectAttemptRef.current = 0;
            setStatus('connected');
            setError(null);
            if (takeover) onTakeover?.();
          } else if (state === 5) {
            if (connectionTimer) clearTimeout(connectionTimer);
            setStatus((current) => {
              // already-open / Switch here already painted — keep it.
              if (current === 'error') return 'error';
              if (current === 'connecting') {
                // Failed before first frame — keep the tab open (Switch here /
                // retry). Do not treat this as an intentional end-session.
                setError((prev) =>
                  prev ||
                  'The remote desktop closed before it finished connecting. The machine may be offline.',
                );
                setConnectFailures((n) => n + 1);
                return 'error';
              }
              if (current === 'connected' || current === 'reconnecting') {
                // The tunnel died without us asking. Do not end the session:
                // the server holds this machine for the full grace window
                // precisely so the worker can come back, and closing the tab
                // here (the old behaviour) threw that away — a media node
                // restart bounced every worker out mid-shift.
                if (
                  !intentionalCloseRef.current &&
                  reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS
                ) {
                  const attempt = reconnectAttemptRef.current;
                  reconnectAttemptRef.current = attempt + 1;
                  // Full jitter, so a node restart does not bring every viewer
                  // back at the same instant (Phase 8 Action 4).
                  reconnectTimer = setTimeout(() => {
                    if (!mounted) return;
                    setReconnectNonce((n) => n + 1);
                  }, backoffDelayMs(attempt));
                  setError(null);
                  return 'reconnecting';
                }
                onDisconnect?.();
              }
              return 'disconnected';
            });
          }
        };

        // Guacamole reports a numeric status alongside the text; 516 means the
        // connection id does not exist, 769 means the credentials were refused.
        // The worker never needs those numbers — the console always does.
        client.onerror = (err: { message?: string; code?: number } | undefined) => {
          if (!mounted) return;
          if (connectionTimer) clearTimeout(connectionTimer);
          if (noteAlreadyOpen(err?.message, err?.code)) {
            reportWarning('Remote desktop already open', err?.message, { rdpId, takeover });
            return;
          }
          reportError('Remote desktop tunnel', new Error(err?.message || 'unknown Guacamole error'), {
            rdpId,
            guacamoleCode: err?.code,
            hint: err?.code === 516
              ? 'Connection id not found in Guacamole — it will be rebuilt on the next attempt.'
              : err?.code === 769
                ? 'Guacamole rejected the RDP credentials for this machine.'
                : undefined,
          });
          setError(
            err?.code === 769
              ? 'The saved sign-in for this machine was rejected. Ask an admin to update it.'
              : 'The remote desktop could not start. Please try again, or ask an admin to check the machine.',
          );
          setStatus('error');
          setConnectFailures((n) => n + 1);
        };

        // Keep the RDP canvas matched to the actual browser viewport. A
        // fullscreen transition happens after this component mounts, so a
        // one-time initial size leaves a black band below the remote desktop.
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
        resizeRemote = () => {
          if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = null;
            fitDisplay();
            const box = displayRef.current;
            if (!box || client.getDisplay().getWidth() === 0) return;
            // Guacamole forwards this to RDP as a display-size update. This
            // prevents a 16:9 desktop from retaining the smaller pre-fullscreen
            // dimensions after the browser enters fullscreen.
            client.sendSize?.(Math.floor(box.clientWidth), Math.floor(box.clientHeight));
          });
        };
        client.getDisplay().onresize = resizeRemote;
        if (displayRef.current) {
          resizeObserver = new ResizeObserver(resizeRemote);
          resizeObserver.observe(displayRef.current);
        }
        window.addEventListener('resize', resizeRemote);
        document.addEventListener('fullscreenchange', resizeRemote);

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

        // guacamole-common-js WebSocketTunnel appends connect data as a query
        // string, so everything the far end needs goes here — never in the
        // tunnel URL itself.
        //
        // Direct gateway: the Guacamole token speaks for us, and GUAC_ID is
        // the connection *name* because auth-json identifies connections by
        // name inside its own "json" data source.
        // Proxied tunnel: the backend authenticates the Supabase token, then
        // strips it before forwarding, and mints the Guacamole token itself.
        const connectData = gateway
          ? new URLSearchParams({
              token: gateway.token,
              GUAC_DATA_SOURCE: gateway.dataSource,
              GUAC_ID: gateway.connectionName,
              GUAC_TYPE: 'c',
              GUAC_WIDTH: String(Math.floor(width)),
              GUAC_HEIGHT: String(Math.floor(height)),
              GUAC_DPI: '96',
            })
          : new URLSearchParams({
              accessToken: idToken,
              GUAC_WIDTH: String(Math.floor(width)),
              GUAC_HEIGHT: String(Math.floor(height)),
              GUAC_DPI: '96',
              ...(takeover ? { takeover: '1' } : {}),
            });
        connectData.append('GUAC_IMAGE', 'image/png');
        connectData.append('GUAC_IMAGE', 'image/jpeg');

        // Surface FastAPI close reasons (e.g. 4409 already-open) before Guacamole paints.
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawTunnel = tunnel as any;
          const prevError = rawTunnel.onerror;
          rawTunnel.onerror = (status: { code?: number; message?: string } | undefined) => {
            if (mounted && noteAlreadyOpen(status?.message, status?.code)) return;
            if (typeof prevError === 'function') prevError(status);
          };
          // guacamole-common-js may not always copy the WebSocket close reason
          // into Status.message — also watch the underlying socket.
          const prevClose = rawTunnel.onclose;
          rawTunnel.onclose = (event: { code?: number; reason?: string } | undefined) => {
            if (mounted && noteAlreadyOpen(event?.reason, event?.code)) return;
            if (typeof prevClose === 'function') prevClose(event);
          };
        } catch { /* ignore */ }

        client.connect(connectData.toString());

        // Silent auth refresh. A Guacamole session times out on inactivity,
        // and the auth-json blob that minted it has its own expiry — but the
        // tunnel already running must not be disturbed to renew either. So we
        // mint a replacement token on a timer and keep it off React state
        // entirely: no re-render, no remount, no black screen mid-shift. A
        // failed refresh is logged and retried, never surfaced to the worker.
        if (gateway) {
          let refreshFailures = 0;
          const scheduleRefresh = (delayMs: number) => {
            refreshTimer = setTimeout(async () => {
              if (!mounted) return;
              try {
                const renewed = await mintGatewayAuth(rdpId);
                if (!mounted) return;
                refreshFailures = 0;
                scheduleRefresh((renewed?.refreshIn ?? gateway!.refreshIn) * 1000);
              } catch (e) {
                reportWarning('Remote desktop auth refresh', e, { rdpId });
                // The canvas is still live, so a failed refresh is not urgent —
                // but every viewer's refresh timer fires on its own schedule,
                // and a gateway outage would otherwise converge them into a
                // synchronised retry. Jittered backoff keeps them apart.
                refreshFailures += 1;
                if (mounted) {
                  scheduleRefresh(
                    retryAfterMs(e) ?? backoffDelayMs(refreshFailures, 5_000, 120_000),
                  );
                }
              }
            }, Math.max(1_000, delayMs));
          };
          scheduleRefresh(gateway.refreshIn * 1000);
        }
        connectionTimer = setTimeout(() => {
          if (!mounted) return;
          // Mid-reconnect, a stalled attempt is not a dead end — it is exactly
          // what a restarting gateway looks like. Spend another slot from the
          // budget rather than giving up after one 20s hang, which would make
          // the reconnect loop useless in the very scenario it exists for.
          if (
            !intentionalCloseRef.current &&
            reconnectAttemptRef.current > 0 &&
            reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS
          ) {
            const attempt = reconnectAttemptRef.current;
            reconnectAttemptRef.current = attempt + 1;
            intentionalCloseRef.current = true; // this teardown is ours
            try { client.disconnect(); } catch { /* ignore */ }
            reconnectTimer = setTimeout(() => {
              if (!mounted) return;
              setReconnectNonce((n) => n + 1);
            }, backoffDelayMs(attempt));
            setStatus('reconnecting');
            return;
          }
          setError('The remote desktop is taking too long to connect. Please close this tab and try again.');
          setStatus('error');
          setConnectFailures((n) => n + 1);
          try { client.disconnect(); } catch { /* ignore */ }
        }, 20_000);
        // Fullscreen sizing may settle a frame or two after connect.
        requestAnimationFrame(resizeRemote);
        window.setTimeout(resizeRemote, 180);
      } catch (e) {
        const msg = reportError('Start remote desktop', e, { rdpId });
        if (!mounted) return;
        setError(msg);
        setStatus('error');
        setConnectFailures((n) => n + 1);
      }
    })();

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      if (connectionTimer) clearTimeout(connectionTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      if (resizeRemote) {
        window.removeEventListener('resize', resizeRemote);
        document.removeEventListener('fullscreenchange', resizeRemote);
      }
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
    // `reconnectNonce` re-runs this effect to rebuild the tunnel and client
    // after an unattended drop. The component itself never unmounts, so status,
    // error and the attempt budget survive the reconnect.
  }, [rdpId, takeover, reconnectNonce]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black overflow-hidden ${className}`}
    >
      <div ref={displayRef} className="w-full h-full min-h-[480px]" />

      {status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-theme-muted text-sm pointer-events-none">
          {takeover ? 'Switching session to this tab…' : 'Connecting to remote desktop…'}
        </div>
      )}
      {status === 'reconnecting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-theme-muted text-sm p-6 text-center pointer-events-none">
          <p className="text-white/90 font-medium">Reconnecting…</p>
          <p className="text-xs">
            The connection dropped. Your desktop is still held for you — leave
            this tab open.
          </p>
        </div>
      )}
      {status === 'disconnected' && !error && !onDisconnect && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-theme-muted text-sm p-6 text-center">
          Session disconnected. You can close this tab.
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-4 pointer-events-auto">
          {switchPrompt && !takeover ? (
            <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-red-900/40">
              <div className="h-[3px] bg-gradient-to-r from-red-800 via-red-500 to-red-800" />
              <div className="bg-[#0f0808] px-6 pt-5 pb-6 space-y-5 text-left">
                <div>
                  <p className="text-[15px] font-bold text-white leading-snug">Already open elsewhere</p>
                  <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                    This desktop is running in another tab. Switch here to move the session to this tab, or go back to the other one.
                  </p>
                </div>
                <button
                  type="button"
                  className="w-full rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-red-900/50 transition-colors"
                  onClick={() => setTakeover(true)}
                >
                  Switch here
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 max-w-md text-center">
              <p className="text-sm text-red-300">{error}</p>
              {connectFailures >= 3 && (
                <p className="text-white/60 text-sm">
                  Still failing after several tries?{' '}
                  <a href="/worker/chat" className="text-emerald-accent font-semibold hover:underline">
                    Contact admin
                  </a>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default RdpViewer;
