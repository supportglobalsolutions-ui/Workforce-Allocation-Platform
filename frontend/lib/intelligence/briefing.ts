/**
 * Client for GET /intelligence/briefing — ops-chief interpretation, not raw concat.
 */
import { api } from '@/lib/api';

export type BriefingSeverity = 'critical' | 'watch' | 'clear';

export interface BriefingEntity {
  type: string;
  id: string;
  name: string;
  detail?: string;
}

export interface BriefingStep {
  label: string;
  href?: string;
}

export interface BriefingEvidence {
  kind: string;
  labels: string[];
  values: number[];
}

export interface BriefingMove {
  id: string;
  domain: string;
  severity: BriefingSeverity;
  headline: string;
  why: string;
  count: number;
  hours_at_risk: number;
  amount_at_risk: number;
  entities: BriefingEntity[];
  evidence: BriefingEvidence;
  steps: BriefingStep[];
}

export interface BriefingScorecard {
  work_hours: number;
  rdp_hours: number;
  week_work_hours: number;
  week_rdp_hours: number;
  today_work_hours: number;
  today_rdp_hours: number;
  today_session_count: number;
  worker_earnings: number;
  worker_payouts: number;
  idle_rdps: number;
  parked_rdps: number;
  producing_rdps: number;
  rdp_count: number;
  quality_avg: number | null;
  quality_count: number;
  workers_with_hours_no_payslip: number;
  payslip_count: number;
  session_count: number;
  week_session_count: number;
}

export interface IntelligenceBriefing {
  period: {
    id: string;
    label: string;
    start_date: string;
    end_date: string;
    currency: string;
    status: string;
  };
  week: {
    from: string;
    to: string;
    work_hours?: number;
    rdp_hours?: number;
    session_count?: number;
  };
  today?: {
    date: string;
    from: string;
    to: string;
    work_hours: number;
    rdp_hours: number;
    session_count: number;
  };
  month?: {
    label: string;
    from: string;
    to: string;
    status: string;
    currency: string;
    work_hours: number;
    rdp_hours: number;
    session_count: number;
    payslip_count: number;
    worker_earnings: number;
    worker_payouts: number;
    quality_avg: number | null;
    quality_count: number;
    parked_rdps: number;
    idle_rdps: number;
    producing_rdps: number;
    rdp_count: number;
    workers_with_hours_no_payslip: number;
  };
  as_of?: string;
  scorecard: BriefingScorecard;
  moves: BriefingMove[];
  alarms: BriefingMove[];
  holding: BriefingMove[];
  charts: {
    daily_hours: { day: string; work_hours: number; rdp_hours: number }[];
    pay_vs_hours: { name: string; worker_id?: string; hours: number; earned: number; paid: number }[];
    quality_buckets: { label: string; count: number }[];
    fleet: { label: string; count: number }[];
  };
  warnings: string[];
}

export interface IntelligenceInspection {
  ok: boolean;
  model?: string | null;
  messages: { tone: BriefingSeverity; title: string; body: string; action?: string }[];
  error?: string | null;
  as_of?: string | null;
}

export async function gatherBriefing(periodId: string): Promise<IntelligenceBriefing> {
  return api.get<IntelligenceBriefing>(`/intelligence/briefing?period_id=${periodId}`);
}

export async function gatherInspection(periodId: string): Promise<IntelligenceInspection> {
  return api.get<IntelligenceInspection>(`/intelligence/inspection?period_id=${periodId}`);
}
