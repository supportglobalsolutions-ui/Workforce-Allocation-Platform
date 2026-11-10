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
  /** Income received for the client this month (Income tab entries); null until entered. */
  actual: string | null;
  received_on: string | null;
  variance: string | null;
  /** Revenue: received if entered, else expected. */
  billing: string;
  billing_source: 'actual' | 'expected' | null;
  /** Number of Income tab entries behind `actual`. */
  income_entries: number;
  shared_costs: string;
  one_off_costs: string;
  /** Other costs: shared + one-off. */
  client_costs: string;
  worker_cost: string;
  payout_currency: string;
  payout_status: string | null;
  notes: string | null;
  locked: boolean;
  warnings: string[];
  /** Paid hours from sessions worked for this client so far this month. */
  session_hours: string;
  session_workers: number;
  /** What those workers have earned for those hours, USD. */
  session_earnings: string;
  /** Workers' payslip transfer costs shared by hours on this client. */
  transfer_cost: string;
  /** Worker cost + transfer cost + other costs. */
  split_total_costs: string;
  /** Revenue − total costs; this is what the recipients share. */
  net_distributable: string;
  recipients: SplitRecipient[];
  /** Earlier month the recipients were carried from, or 'agreement' / 'default'. */
  recipients_from: string | null;
  split_check: 'OK' | 'Check split';
  /** Kept by Global Solutions. */
  gs_amount: string;
  /** Owed to the other payees. */
  payout_amount: string;
}

export interface SplitRecipient {
  slot: number;
  payee_id: string | null;
  name: string | null;
  is_gs: boolean;
  pct: string;
  /** Net distributable × pct. */
  amount_calc: string;
  /** Typed amount for this month, when set. */
  amount_override: string | null;
  /** What is paid: the override, else the worked-out amount. */
  amount: string;
  payout_ready: boolean;
}

export interface ClientLedgerSheet {
  period_id: string;
  period_label: string;
  status: string;
  currency: string;
  /** Client split header: the local currency and its rate. */
  local_currency: string;
  local_per_usd: string | null;
  payroll_date: string;
  rows: ClientMonth[];
  totals: Record<string, string>;
}

/** Someone client money is paid to (/payees). */
export interface Payee {
  id: string;
  name: string;
  is_gs: boolean;
  payout_currency: string | null;
  payout_email: string | null;
  payout_method: string | null;
  payout_details: string | null;
  notes: string | null;
  active: boolean;
  payout_ready: boolean;
  clients: string[];
  /** Standing % of each linked client; adding the payee to a client's split starts from it. */
  links: PayeeLink[];
}

export interface PayeeLink {
  client_id: string;
  client_name: string;
  pct: string;
}

export type PayoutStatus = 'not_prepared' | 'draft' | 'sent' | 'paid';

export interface PayoutLine {
  client_id: string;
  client_name: string;
  pct: string;
  amount_usd: string;
}

/** One payee's payout for a month (/client-payouts): one line per client. */
export interface PayeePayoutRow {
  payee_id: string;
  payee_name: string;
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
  payout_ready: boolean;
  lines: PayoutLine[];
  warnings: string[];
}

/** A per-client payout from before payees (read-only). */
export interface LegacyPayoutRow {
  client_id: string;
  client_name: string;
  status: string;
  currency: string;
  amount_usd: string;
  amount_local: string | null;
  paid_at: string | null;
  reference: string | null;
}

export interface PayeePayoutSheet {
  period_id: string;
  period_label: string;
  status: string;
  ready: boolean;
  rows: PayeePayoutRow[];
  gs: { amount_usd: string; lines: PayoutLine[] };
  legacy: LegacyPayoutRow[];
  totals: { total_usd: string; paid_usd: string; outstanding_usd: string };
  sent?: number;
  failed?: { payee: string; error: string | null }[];
}

export type IncomeCategory = 'client_payout' | 'gs_account' | 'other';

export interface IncomeEntry {
  id: string;
  category: IncomeCategory;
  category_label: string;
  amount: string;
  currency: string;
  fx_rate: string;
  amount_usd: string;
  description: string | null;
  client_id: string | null;
  client_name: string | null;
  received_on: string | null;
  created_at: string | null;
}

export interface IncomeSheet {
  period_id: string;
  period_label: string;
  status: string;
  locked: boolean;
  categories: Record<IncomeCategory, string>;
  entries: IncomeEntry[];
  totals: { total_usd: string; by_category: Record<IncomeCategory, string> };
}

/** A month mismatch. Soft warnings set `blocks: false` and do not stop approval. */
export interface MonthIssue {
  key: string;
  kind: string;
  message: string;
  href: string;
  blocks?: boolean;
}

export interface MonthChecks {
  issues: MonthIssue[];
  blocked: boolean;
  bypass: { reason: string | null; by: string | null; at: string | null; issues?: MonthIssue[] } | null;
}
