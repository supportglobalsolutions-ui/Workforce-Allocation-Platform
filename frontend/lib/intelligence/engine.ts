/**
 * Client for the backend intelligence engine (`GET /intelligence/snapshot`).
 * Sources are concatenated on the server. A failed domain still returns empty
 * data plus a warning; the page must not treat that as a total failure.
 */
import { api } from '@/lib/api';

export type Source<T> = { ok: boolean; data: T; error: string | null };

export interface PayslipRow {
  id?: string;
  worker_id: string;
  worker_display_name: string;
  hours_logged?: number | string;
  rate_per_hour?: number | string;
  gross_earned: number | string;
  final_net: number | string;
  total_deductions?: number | string;
  local_currency?: string;
  session_count?: number | null;
}

export interface RevenueShareRow {
  client_id: string | null;
  client_name: string;
  platform: string;
  earnings: string | number;
  worker_cost: string | number;
  distributable: string | number;
  gs_share: string | number;
  owner_share: string | number;
}

export interface RdpEarningsOwner {
  owner_key: string;
  owner_name: string;
  owner_type: string;
  rdp_count: number;
  hours: string;
  produced: string;
  gs_share: string;
  owner_share: string;
}

export interface RdpEarningsRow {
  rdp_id: string;
  nickname: string;
  client_id: string | null;
  client_name: string;
  owner_key: string;
  owner_name: string;
  produced: string;
  hours: string;
  session_count: number;
}

export interface RdpEarningsReport {
  currency: string;
  rdps: RdpEarningsRow[];
  owners: RdpEarningsOwner[];
}

export interface PayrollLine {
  id: string;
  session_id: string;
  worker_id: string;
  payroll_period_id: string;
  gross_amount: number | string;
  worker_net?: number | string;
}

export interface SessionRow {
  id: string;
  worker_id: string;
  rdp_resource_id?: string | null;
  client_id?: string | null;
  start_time: string;
  end_time?: string | null;
  image_start_at?: string | null;
  image_end_at?: string | null;
  payroll_period_id?: string | null;
}

export interface QualityScore {
  composite_score: number | string;
}

export interface IntelligenceSnapshot {
  period_id: string;
  payslips: Source<PayslipRow[]>;
  revenue_share: Source<RevenueShareRow[]>;
  rdp_earnings: Source<RdpEarningsReport>;
  line_items: Source<PayrollLine[]>;
  sessions: Source<SessionRow[]>;
  quality: Source<QualityScore[]>;
  clients?: Source<Record<string, unknown>[]>;
  rdps?: Source<Record<string, unknown>[]>;
  workers?: Source<Record<string, unknown>[]>;
  warnings: string[];
}

export async function gatherIntelligence(periodId: string): Promise<IntelligenceSnapshot> {
  return api.get<IntelligenceSnapshot>(`/intelligence/snapshot?period_id=${periodId}`);
}

export function num(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
