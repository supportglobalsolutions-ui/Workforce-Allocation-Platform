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

export const getRdpTunnelInfo = (rdpId: string) =>
  api.get<TunnelInfo>(`/rdp/${rdpId}/tunnel-info`);

/** Open the dedicated remote-desktop tab (full viewport + fullscreen controls). */
export function openRdpDesktopTab(rdpId: string): Window | null {
  const url = `/worker/rdp-session/${rdpId}/desktop`;
  return window.open(url, `rdp-desktop-${rdpId}`, 'noopener,noreferrer');
}
