/** One client's month on the Client ledger (/client-billing), all in USD. */
export interface ClientMonth {
  client_id: string;
  client_name: string;
  platform: string;
  contract_status: string;
  hours_from_desktops: boolean;
  desktop_count: number;
  desktop_hours: string;
  billed_hours: string | null;
  billed_hours_manual: string | null;
  hours_source: 'desktops' | 'typed' | null;
  rate: string | null;
  rate_source: 'tier' | 'client' | null;
  tier_name: string | null;
  expected: string | null;
  actual: string | null;
  received_on: string | null;
  variance: string | null;
  basis: string;
  basis_source: 'actual' | 'expected' | null;
  client_pct: string;
  gs_pct: string;
  shared_costs: string;
  one_off_costs: string;
  client_costs: string;
  client_share: string;
  gs_share: string;
  worker_cost: string;
  gs_margin: string;
  payout_currency: string;
  payout_status: string | null;
  notes: string | null;
  locked: boolean;
  warnings: string[];
}

export interface ClientLedgerSheet {
  period_id: string;
  period_label: string;
  status: string;
  currency: string;
  rows: ClientMonth[];
  totals: Record<string, string>;
}

export type PayoutStatus = 'not_prepared' | 'draft' | 'sent' | 'paid';

/** One client's payout for a month (/client-payouts). */
export interface ClientPayoutRow {
  client_id: string;
  client_name: string;
  platform: string;
  payout_id: string | null;
  status: PayoutStatus;
  currency: string;
  fx_rate: string | null;
  fx_frozen: boolean;
  amount_usd: string;
  amount_local: string | null;
  sent_at: string | null;
  paid_at: string | null;
  reference: string | null;
  payout_email: string | null;
  payout_method: string | null;
  payout_details: string | null;
  billed_hours: string | null;
  basis: string;
  client_pct: string;
  client_costs: string;
  client_share: string;
  warnings: string[];
}

export interface ClientPayoutSheet {
  period_id: string;
  period_label: string;
  status: string;
  ready: boolean;
  rows: ClientPayoutRow[];
  totals: { total_usd: string; paid_usd: string; outstanding_usd: string };
  sent?: number;
  failed?: { client: string; error: string | null }[];
}
