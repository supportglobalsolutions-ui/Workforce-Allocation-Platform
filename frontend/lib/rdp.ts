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

/** Open the dedicated remote-desktop tab (full viewport). Returns the Window so callers can close it later. */
export function openRdpDesktopTab(rdpId: string): Window | null {
  const url = `/worker/rdp-session/${rdpId}/desktop`;
  return window.open(url, `rdp-desktop-${rdpId}`);
}
