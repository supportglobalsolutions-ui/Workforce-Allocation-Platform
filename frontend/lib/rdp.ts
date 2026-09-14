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
}

export interface TunnelInfo {
  tunnel_url: string;
  token: string;
  data_source: string;
  connection_id: string;
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

export const lockRdp = (rdpId: string) =>
  api.post<{ rdp_resource_id: string; status: string }>(`/rdp/${rdpId}/lock`, {});

export const unlockRdp = (rdpId: string) =>
  api.post<{ rdp_resource_id: string; status: string }>(`/rdp/${rdpId}/unlock`, {});

export const maintenanceRdp = (rdpId: string) =>
  api.post<{ rdp_resource_id: string; status: string }>(`/rdp/${rdpId}/maintenance`, {});

export const forceReleaseRdp = (rdpId: string, reason: string) =>
  api.post<EndConnectionResult & { reason: string }>(`/rdp/${rdpId}/force-release`, { reason });

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
}

/** Write-only — forwarded to Guacamole, never stored in the app DB. */
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

export const getRdpTunnelInfo = (rdpId: string) =>
  api.get<TunnelInfo>(`/rdp/${rdpId}/tunnel-info`);

export const rdpDesktopUrl = (rdpId: string) => `/worker/rdp-session/${rdpId}/desktop`;

/** Open the dedicated remote-desktop tab (full viewport). Returns the Window so callers can close it later. */
export function openRdpDesktopTab(rdpId: string): Window | null {
  return window.open(rdpDesktopUrl(rdpId), `rdp-desktop-${rdpId}`);
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

export function sendTabToDesktop(win: Window | null, rdpId: string): void {
  if (!win || win.closed) return;
  win.location.replace(rdpDesktopUrl(rdpId));
}

export function closeReservedTab(win: Window | null): void {
  try {
    if (win && !win.closed) win.close();
  } catch {
    /* ignore */
  }
}
