'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Mail, Wallet as WalletIcon } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Wallet {
  id: string;
  balance: number;
  currency: string;
  updated_at: string;
}

interface WalletTransaction {
  id: string;
  tx_type: 'payroll_credit' | 'adjustment' | 'payout' | string;
  amount: number;
  currency: string;
  period_label: string | null;
  note: string | null;
  created_at: string;
}

interface PayslipSummary {
  id: string;
  period_label: string;
  hours_logged: number;
  rate_per_hour: number;
  base_pay: number;
  bonus: number;
  gross_earned: number;
  transfer_cost: number;
  external_cost: number;
  total_deductions: number;
  final_net: number;
  local_currency: string;
  fx_rate: number | null;
  base_currency: string | null;
  base_equivalent: number | null;
}

type WalletTab = 'transactions' | 'payslips';

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (x: number | null | undefined) =>
  Number(x ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TX_CHIP: Record<string, { label: string; classes: string }> = {
  payroll_credit: { label: 'Payroll credit', classes: 'bg-emerald-accent/20 text-emerald-accent border-emerald-accent/30' },
  adjustment:     { label: 'Adjustment',     classes: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  payout:         { label: 'Payout',         classes: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

function txSign(tx: WalletTransaction): { sign: '+' | '−'; color: string } {
  if (tx.tx_type === 'payout') return { sign: '−', color: 'text-amber-400' };
  if (tx.tx_type === 'payroll_credit') return { sign: '+', color: 'text-emerald-accent' };
  return Number(tx.amount) < 0
    ? { sign: '−', color: 'text-blue-400' }
    : { sign: '+', color: 'text-blue-400' };
}

// ── Payslip card ───────────────────────────────────────────────────────────────

function PayslipCard({ slip }: { slip: PayslipSummary }) {
  const [open, setOpen] = useState(false);

  const hasFx = slip.fx_rate != null && slip.base_currency != null && slip.base_equivalent != null;
  // Scale that converts local amounts to base-currency equivalents, derived from
  // the summary itself so it works regardless of the fx-rate direction.
  const baseScale = hasFx && Number(slip.final_net) !== 0
    ? Number(slip.base_equivalent) / Number(slip.final_net)
    : null;

  const money = (amount: number, negative = false) => (
    <span className="text-right">
      <span className="block text-sm font-semibold text-white tabular-nums">
        {negative && Number(amount) !== 0 ? '−' : ''}{fmt(amount)} {slip.local_currency}
      </span>
      {baseScale != null && (
        <span className="block text-[11px] text-theme-muted tabular-nums">
          ≈ {negative && Number(amount) !== 0 ? '−' : ''}{fmt(Number(amount) * baseScale)} {slip.base_currency}
        </span>
      )}
    </span>
  );

  const lines: { label: string; value: React.ReactNode; divider?: boolean; emphasis?: boolean }[] = [
    { label: 'Hours Logged', value: <span className="text-sm font-semibold text-white tabular-nums">{fmt(slip.hours_logged)} h</span> },
    { label: 'Rate per Hour', value: money(slip.rate_per_hour) },
    { label: 'Base Pay', value: money(slip.base_pay) },
    { label: 'Bonus', value: money(slip.bonus) },
    { label: 'Gross Earned', value: money(slip.gross_earned), divider: true },
    { label: 'Transfer Cost Deduction', value: money(slip.transfer_cost, true) },
    { label: 'External Cost Deduction', value: money(slip.external_cost, true) },
    { label: 'Total Deductions', value: money(slip.total_deductions, true), divider: true },
    { label: 'Final Net Pay Due', value: money(slip.final_net), emphasis: true },
  ];

  return (
    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div>
          <p className="text-sm font-bold text-white">{slip.period_label}</p>
          <p className="text-xs text-theme-muted mt-0.5">
            {fmt(slip.hours_logged)} h logged
            {hasFx ? ` · FX ${slip.fx_rate}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-right">
            <span className="block text-sm font-black text-emerald-accent tabular-nums">
              {fmt(slip.final_net)} {slip.local_currency}
            </span>
            {hasFx && (
              <span className="block text-[11px] text-theme-muted tabular-nums">
                ≈ {fmt(slip.base_equivalent)} {slip.base_currency}
              </span>
            )}
          </span>
          {open ? <ChevronUp size={16} className="text-theme-muted shrink-0" /> : <ChevronDown size={16} className="text-theme-muted shrink-0" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-white/[0.06]">
          {lines.map(({ label, value, divider, emphasis }) => (
            <div key={label}>
              <div className={`flex items-center justify-between gap-4 py-2.5 ${emphasis ? 'rounded-xl bg-emerald-accent/5 px-3 -mx-3 mt-1' : ''}`}>
                <span className={`text-xs ${emphasis ? 'font-bold text-emerald-accent uppercase tracking-wider' : 'text-theme-muted'}`}>{label}</span>
                {value}
              </div>
              {divider && <div className="border-t border-white/[0.06]" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [payslips, setPayslips] = useState<PayslipSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WalletTab>('transactions');

  useEffect(() => {
    Promise.all([
      api.get<Wallet>('/wallets/me'),
      api.get<WalletTransaction[]>('/wallets/me/transactions'),
      api.get<PayslipSummary[]>('/payroll/my-summaries'),
    ])
      .then(([w, txs, slips]) => { setWallet(w); setTransactions(txs); setPayslips(slips); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load wallet'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <SpinningDots size="lg" className="text-emerald-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader title="Wallet" description="Your earnings balance and payment history." />
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <PageHeader title="Wallet" description="Your earnings balance and payment history." />

      {/* Hero balance card */}
      <div className="relative glass-panel rounded-2xl border border-emerald-accent/20 overflow-hidden p-6 md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(600px_200px_at_85%_0%,rgba(63,199,160,0.12),transparent_65%)] pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-theme-muted">
              <span className="w-7 h-7 rounded-lg bg-emerald-accent/10 text-emerald-accent flex items-center justify-center">
                <WalletIcon size={14} />
              </span>
              Current Balance
            </div>
            <p className="mt-3 text-4xl md:text-5xl font-black text-theme-heading tracking-tight tabular-nums">
              {fmt(wallet?.balance)}
              <span className="ml-2 text-lg font-bold text-emerald-accent">{wallet?.currency}</span>
            </p>
            {wallet?.updated_at && (
              <p className="text-xs text-theme-muted mt-2">
                Updated {new Date(wallet.updated_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <div className="relative mt-5 pt-4 border-t border-white/[0.06] flex items-center gap-2 text-xs text-theme-muted">
          <Mail size={13} className="text-gold-accent shrink-0" />
          Payslips are emailed to you each pay period from gsdeck.com.
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 w-fit">
        {([
          { key: 'transactions', label: 'Transactions', count: transactions.length },
          { key: 'payslips', label: 'Payslip History', count: payslips.length },
        ] as { key: WalletTab; label: string; count: number }[]).map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === key ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-white'
            }`}
          >
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              tab === key ? 'bg-emerald-accent/20 text-emerald-400' : 'bg-white/10 text-theme-muted'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Transactions */}
      {tab === 'transactions' && (
        transactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-12 text-center">
            <p className="text-sm text-theme-muted">No transactions yet. Payroll credits will appear here once a pay period is approved.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const chip = TX_CHIP[tx.tx_type] ?? { label: tx.tx_type, classes: 'bg-white/10 text-theme-muted border-white/10' };
              const { sign, color } = txSign(tx);
              return (
                <div
                  key={tx.id}
                  className="glass-panel rounded-xl border border-white/[0.06] px-4 py-3.5 flex flex-wrap items-center gap-3"
                >
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${chip.classes}`}>
                    {chip.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    {tx.period_label && <p className="text-sm font-semibold text-white truncate">{tx.period_label}</p>}
                    {tx.note && <p className="text-xs text-theme-muted truncate">{tx.note}</p>}
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black tabular-nums ${color}`}>
                      {sign}{fmt(Math.abs(Number(tx.amount)))} {tx.currency}
                    </p>
                    <p className="text-[11px] text-theme-muted">{new Date(tx.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Payslip history */}
      {tab === 'payslips' && (
        payslips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-12 text-center">
            <p className="text-sm text-theme-muted">No payslips yet — they appear here once a payroll period is approved and paid.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payslips.map((slip) => <PayslipCard key={slip.id} slip={slip} />)}
          </div>
        )
      )}
    </div>
  );
}
