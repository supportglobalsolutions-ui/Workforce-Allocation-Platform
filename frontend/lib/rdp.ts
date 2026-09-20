import { api } from '@/lib/api';

export interface MyActiveRdp {
  allocation_id: string;
  rdp_resource_id: string;
  session_id: string | null;
  nickname: string;
  status: string;
  guacamole_viewer_path: string | null;
}

export interface ClaimResult {
  allocation_id: string;
  session_id: string | null;
  rdp_resource_id: string;
  worker_id: string;
  status: string;
  guacamole_url: string | null;
  guacamole_viewer_path: string | null;
  guacamole_error?: string | null;
  resumed?: boolean;
  /** Phase 4 — stale disconnects/tickets must carry this generation. */
  connection_generation?: number;
}

export interface TunnelInfo {
  tunnel_url: string;
  /** Always null — Guacamole tokens never leave the API (Phase 1 Safety). */
  token: null;
  data_source: string;
  connection_id: string;
  note?: string;
}

export interface EndConnectionResult {
  rdp_resource_id: string;
  status: string;
  released: boolean;
  guacamole_disconnected: boolean;
  closed_session_ids: string[];
}

export interface RdpPreflight {
  ok: boolean;
  error: string | null;
  guacamole_connection_id: string | null;
  host?: string | null;
  port?: number | null;
}

export const probeRdp = (rdpId: string) =>
  api.get<RdpPreflight>(`/rdp/${rdpId}/preflight`);

export const getMyActiveRdp = () => api.get<MyActiveRdp | null>('/rdp/my-active');

export const claimRdp = (rdpId: string) =>
  api.post<ClaimResult>(`/rdp/${rdpId}/claim`, {});

export const endRdpConnection = (rdpId: string) =>
  api.post<EndConnectionResult>(`/rdp/${rdpId}/end-connection`, {});

/** Tell sibling tabs (desktop / claim board / control) the session is over. */
export function broadcastRdpSessionEnded(payload: {
  rdpId: string;
  sessionId?: string | null;
  evidenceUrl: string;
  openedBy: 'control' | 'desktop';
  fromTabId?: string;
}): void {
  try {
    const ch = new BroadcastChannel('rdp-events');
    ch.postMessage({ type: 'session-ended', ...payload });
    ch.close();
  } catch {
    /* BroadcastChannel unsupported — sibling tabs poll instead */
  }
}

/**
 * Release the claim, but never hang the End button forever.
 * Guacamole confirmation can stall; workers must still be able to leave.
 */
export async function endRdpConnectionSafe(
  rdpId: string,
  timeoutMs = 20_000,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    await Promise.race([
      endRdpConnection(rdpId),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('End session timed out')), timeoutMs);
      }),
    ]);
    return { ok: true };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    if (raw.toLowerCase().includes('already') || raw.toLowerCase().includes('no longer')) {
      return { ok: true };
    }
    return { ok: false, error };
  }
}

/** Portal a desktop was opened from — evidence and back-links stay inside it. */
export type RdpPortal = '/worker' | '/leadership';

export const DEFAULT_RDP_PORTAL: RdpPortal = '/worker';

/** Read the portal off the desktop tab's query string. */
export function portalFromParam(value: string | null | undefined): RdpPortal {
  return value === 'leadership' ? '/leadership' : DEFAULT_RDP_PORTAL;
}

export function sessionEvidenceUrl(
  rdpId: string,
  sessionId?: string | null,
  basePath: RdpPortal = DEFAULT_RDP_PORTAL,
): string {
  const q = new URLSearchParams({ evidence: '1', rdp: rdpId });
  if (sessionId) q.set('session', sessionId);
  return `${basePath}/session-history?${q.toString()}`;
}

export const lockRdp = (rdpId: string) =>
  api.post<{ rdp_resource_id: string; status: string }>(`/rdp/${rdpId}/lock`, {});

export const unlockRdp = (rdpId: string) =>
  api.post<{ rdp_resource_id: string; status: string }>(`/rdp/${rdpId}/unlock`, {});

export const maintenanceRdp = (rdpId: string) =>
  api.post<{ rdp_resource_id: string; status: string }>(`/rdp/${rdpId}/maintenance`, {});

export const setRdpStatus = (rdpId: string, mode: 'online' | 'locked' | 'maintenance') =>
  api.post<RdpResource>(`/rdp/${rdpId}/set-status`, { mode });

export const getRdpCredentials = (rdpId: string) =>
  api.get<{
    rdp_resource_id: string;
    rdp_username: string | null;
    rdp_password: string | null;
    rdp_domain: string | null;
    has_rdp_password: boolean;
  }>(`/rdp/${rdpId}/credentials`);

export const forceReleaseRdp = (rdpId: string, reason?: string) =>
  api.post<EndConnectionResult & { reason: string; status?: string }>(
    `/rdp/${rdpId}/force-release`,
    { reason: reason?.trim() || undefined },
  );

/** Machines stranded mid-close or held after an unconfirmed End (Phase 8). */
export interface QuarantinedRdpRow {
  allocation_id: string;
  rdp_resource_id: string;
  nickname: string | null;
  worker_id: string;
  gateway_id?: string | null;
  connection_generation?: number;
  quarantined_at?: string | null;
  held_at?: string | null;
  reason: string | null;
  status?: string;
  allocation_released?: boolean;
}

export interface QuarantinedLists {
  quarantined: QuarantinedRdpRow[];
  held: QuarantinedRdpRow[];
}

export const listQuarantinedRdp = () =>
  api.get<QuarantinedLists>('/rdp/quarantined');

/** Retry the closure that stranded the machine; never frees on unproven close. */
export const repairRdp = (rdpId: string) =>
  api.post<{ ok: boolean; code: string; friendly?: string; status?: string }>(
    `/rdp/${rdpId}/repair`,
    {},
  );

export interface RdpResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
  client_id: string | null;
  status: string;
  assigned_worker_id: string | null;
  assigned_worker_name?: string | null;
  client_name?: string | null;
  owner_name?: string | null;
  owner_type?: string | null;
  guacamole_connection_id: string | null;
  health_notes: string | null;
  monitor_host: string | null;
  monitor_port: number | null;
  last_health_check_at: string | null;
  status_changed_at: string;
  /** Admin-only: username for card display. Password never returned. */
  rdp_username?: string | null;
  has_rdp_password?: boolean;
  /** Admin-only: workers this machine is offered to on the claim board. */
  allowed_worker_ids?: string[];
  allowed_workers?: { id: string; name: string }[];
}

/** Write-only password (+ optional username/domain) for Guacamole sync. */
export interface RdpCredentials {
  rdp_username?: string | null;
  rdp_password?: string | null;
  rdp_domain?: string | null;
  /** Default true: the backend creates/updates the Guacamole connection for you. */
  auto_provision?: boolean;
}

export interface RdpResourceCreateBody extends RdpCredentials {
  nickname: string;
  country: string;
  client_group: string;
  client_id?: string | null;
  status?: string;
  monitor_host?: string | null;
  monitor_port?: number | null;
  guacamole_connection_id?: string | null;
  health_notes?: string | null;
  allowed_worker_ids?: string[];
}

export interface RdpResourceUpdateBody extends RdpCredentials {
  nickname?: string;
  country?: string;
  client_group?: string;
  client_id?: string | null;
  monitor_host?: string | null;
  monitor_port?: number | null;
  guacamole_connection_id?: string | null;
  health_notes?: string | null;
  /** Replaces the audience wholesale; omit to leave it unchanged. */
  allowed_worker_ids?: string[];
}

export interface RdpProvisionResult {
  rdp_resource_id: string;
  guacamole_connection_id: string | null;
  created: boolean;
  provisioned: boolean;
  error?: string | null;
}

export interface GuacamoleHealth {
  guacamole_url: string;
  reachable: boolean;
  authenticated: boolean;
  error: string | null;
  connection_count: number;
  machines: {
    id: string;
    nickname: string;
    monitor_host: string | null;
    guacamole_connection_id: string | null;
    connection_state: 'ok' | 'stale' | 'missing' | 'unknown';
    ready: boolean;
  }[];
}

export const listRdpResources = () => api.get<RdpResource[]>('/rdp');

export const createRdpResource = (body: RdpResourceCreateBody) =>
  api.post<RdpResource>('/rdp', {
    status: 'online_free',
    risk_flags: [],
    ...body,
  });

export const updateRdpResource = (rdpId: string, body: RdpResourceUpdateBody) =>
  api.patch<RdpResource>(`/rdp/${rdpId}`, body);

/** Create or repair this machine's Guacamole connection (idempotent). */
export const provisionRdpConnection = (rdpId: string, creds: RdpCredentials = {}) =>
  api.post<RdpProvisionResult>(`/rdp/${rdpId}/provision`, { auto_provision: true, ...creds });

export const getGuacamoleHealth = () => api.get<GuacamoleHealth>('/rdp/guacamole/health');

/** Staff-only diagnostics. Never returns a Guacamole auth token. */
export const getRdpTunnelInfo = (rdpId: string) =>
  api.get<TunnelInfo>(`/rdp/${rdpId}/tunnel-info`);

/**
 * Pass to open the desktop directly on the Guacamole gateway (Phase 5).
 *
 * `mode: 'proxy'` is a normal answer, not a failure: this caller is outside
 * the rollout cohort and the viewer should keep using the FastAPI ws-tunnel.
 */
export interface RdpJoinTicket {
  mode: 'direct' | 'proxy';
  /** Single-use, ~30s. Spent on the Guacamole token mint, never reused. */
  ticket: string | null;
  /**
   * Encrypted guacamole-auth-json blob. Opaque to the browser — only
   * Guacamole holds the key — and grants exactly one connection.
   */
  auth_data: string | null;
  guacamole_url: string | null;
  data_source: string | null;
  connection_name: string | null;
  generation: number | null;
  expires_in: number | null;
  /** Seconds until the viewer should quietly mint a fresh token. */
  refresh_in: number | null;
  reason: string | null;
}

export const createJoinTicket = (rdpId: string) =>
  api.post<RdpJoinTicket>(`/rdp/${rdpId}/join-ticket`, {});

/** True when another tab already holds the live desktop tunnel. */
export const getDesktopGuard = (rdpId: string) =>
  api.get<{ already_open: boolean; switch_allowed: boolean; message: string | null }>(
    `/rdp/${rdpId}/desktop-guard`,
  );

/**
 * The desktop tab itself lives under /worker for every role (it renders no
 * shell), so it carries the opener's portal as a query param and hands that
 * back when the session ends.
 */
export const rdpDesktopUrl = (
  rdpId: string,
  basePath: RdpPortal = DEFAULT_RDP_PORTAL,
) => {
  const base = `/worker/rdp-session/${rdpId}/desktop`;
  return basePath === '/leadership' ? `${base}?portal=leadership` : base;
};

/** Open the dedicated remote-desktop tab (full viewport). Returns the Window so callers can close it later. */
export function openRdpDesktopTab(
  rdpId: string,
  basePath: RdpPortal = DEFAULT_RDP_PORTAL,
): Window | null {
  return window.open(rdpDesktopUrl(rdpId, basePath), `rdp-desktop-${rdpId}`);
}

/**
 * Reserve a tab during the click handler, before any await.
 *
 * Browsers only allow window.open while a user gesture is being handled; opening
 * it after `await claimRdp(...)` gets silently blocked. So we grab a blank tab
 * synchronously on click and point it at the desktop once the claim returns.
 */
export function reserveDesktopTab(rdpId: string): Window | null {
  const win = window.open('', `rdp-desktop-${rdpId}`);
  if (!win) return null;
  // The tab exists before the claim resolves, so paint something into it —
  // otherwise the worker stares at a blank page for the whole request.
  try {
    win.document.write(`<!doctype html><html><head><title>Connecting…</title>
<style>
  html,body{height:100%;margin:0}
  body{background:#0b1220;color:#e6edf7;display:flex;align-items:center;
       justify-content:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
  .box{text-align:center}
  .ring{width:34px;height:34px;margin:0 auto 14px;border-radius:50%;
        border:3px solid rgba(255,255,255,.15);border-top-color:#34d399;
        animation:spin .9s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{margin:0;font-size:14px}
  small{display:block;margin-top:6px;color:rgba(230,237,247,.5);font-size:12px}
</style></head><body><div class="box"><div class="ring"></div>
<p>Preparing your remote desktop…</p>
<small>Claiming the machine. This tab opens automatically.</small>
</div></body></html>`);
    win.document.close();
  } catch {
    /* cross-origin or blocked — the navigation below still works */
  }
  return win;
}

export function sendTabToDesktop(
  win: Window | null,
  rdpId: string,
  basePath: RdpPortal = DEFAULT_RDP_PORTAL,
): void {
  if (!win || win.closed) return;
  win.location.replace(rdpDesktopUrl(rdpId, basePath));
}

export function closeReservedTab(win: Window | null): void {
  try {
    if (win && !win.closed) win.close();
  } catch {
    /* ignore */
  }
}
