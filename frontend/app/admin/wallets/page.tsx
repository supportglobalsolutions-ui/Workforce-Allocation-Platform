'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeftRight, CheckCircle, Coins, Receipt, Search, Send, Wallet, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import DataTable from '@/components/platform/DataTable';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { formatMoney, formatMoneyTotals, moneyTotalsList, useMoneyDisplay } from '@/lib/money';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WalletRow {
  id: string;
  worker_id: string;
  balance: number;
  currency: string;
  updated_at: string;
  worker_display_name: string;
  worker_country: string;
}

type TxType = 'payroll_credit' | 'adjustment' | 'payout';

interface WalletTx {
  id: string;
  tx_type: TxType;
  amount: number;
  currency: string;
  payroll_period_id: string | null;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  hours_logged: number | null;
  rate_per_hour: number | null;
  rate_currency: string | null;
  note: string | null;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtAmount = (x: number) =>
  Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const TX_CHIP: Record<TxType, { label: string; classes: string }> = {
  payroll_credit: { label: 'Payroll', classes: 'bg-emerald-accent/20 text-emerald-accent border-emerald-accent/30' },
  adjustment: { label: 'Adjustment', classes: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  payout: { label: 'Payout', classes: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

function TxTypeChip({ type }: { type: TxType }) {
  const chip = TX_CHIP[type] ?? { label: type, classes: 'bg-white/10 text-theme-muted border-white/10' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${chip.classes}`}>
      {chip.label}
    </span>
  );
}

// ── Transactions modal ─────────────────────────────────────────────────────────

function TransactionsModal({ wallet, onClose }: { wallet: WalletRow; onClose: () => void }) {
  const [txs, setTxs] = useState<WalletTx[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<WalletTx[]>(`/wallets/${wallet.worker_id}/transactions`)
      .then(setTxs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load transactions'));
  }, [wallet.worker_id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">{wallet.worker_display_name}</h2>
            <p className="text-xs text-theme-muted mt-0.5">
              Balance: <span className="text-white font-bold">{formatMoney(wallet.balance, wallet.currency)}</span>
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {error ? (
            <p className="text-danger text-sm">{error}</p>
          ) : txs === null ? (
            <div className="flex justify-center py-10"><SpinningDots size="md" className="text-emerald-accent" /></div>
          ) : txs.length === 0 ? (
            <div className="text-center py-8">
              <Receipt size={24} className="mx-auto text-theme-muted mb-3" />
              <p className="text-theme-muted text-sm">No transactions yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {txs.map((t) => {
                const positive = Number(t.amount) >= 0;
                return (
                  <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <TxTypeChip type={t.tx_type} />
                        {t.period_label && (
                          <span className="text-[10px] font-mono text-theme-muted bg-white/5 px-1.5 py-0.5 rounded">
                            {t.period_label}
                          </span>
                        )}
                      </div>
                      {t.period_start && t.period_end && (
                        <p className="text-xs text-white/90 mt-1.5">
                          Work {fmtDay(t.period_start)} – {fmtDay(t.period_end)}
                          {t.hours_logged != null && t.rate_per_hour != null && (
                            <span className="text-theme-muted">
                              {' '}· {fmtAmount(t.hours_logged)} h × {formatMoney(t.rate_per_hour, t.rate_currency ?? t.currency)}/hr
                            </span>
                          )}
                        </p>
                      )}
                      {t.note && !t.period_start && <p className="text-xs text-theme-muted mt-1.5">{t.note}</p>}
                      <p className="text-[10px] text-theme-muted/70 mt-1">Received {new Date(t.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`shrink-0 text-sm font-bold ${positive ? 'text-emerald-accent' : 'text-danger'}`}>
                      {positive ? '+' : '−'}{formatMoney(Math.abs(Number(t.amount)), t.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Adjust modal ───────────────────────────────────────────────────────────────

function AdjustModal({ wallet, onClose, onDone }: { wallet: WalletRow; onClose: () => void; onDone: () => void }) {
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(wallet.currency);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Math.abs(Number(amount));
    if (!value) { setError('Enter a non-zero amount.'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.post('/wallets/adjustments', {
        worker_id: wallet.worker_id,
        amount: direction === 'debit' ? -value : value,
        currency: currency.trim().toUpperCase() || wallet.currency,
        note: note.trim(),
      });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save adjustment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-bold text-white">Adjust Wallet</h2>
            <p className="text-xs text-theme-muted mt-0.5">
              {wallet.worker_display_name} · current {wallet.currency} {fmtAmount(wallet.balance)}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 w-fit">
            {(['credit', 'debit'] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDirection(d)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  direction === d
                    ? d === 'credit' ? 'bg-emerald-accent/20 text-emerald-400' : 'bg-danger/20 text-danger'
                    : 'text-theme-muted hover:text-white'
                }`}>
                {d}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Amount *</label>
              <input required type="number" step="any" min={0} value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="input-field" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Currency</label>
              <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3} className="input-field uppercase" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Note (required)</label>
            <textarea required rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for this adjustment" className="input-field resize-y" />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving && <SpinningDots size="sm" className="text-emerald-accent" />}
              {direction === 'credit' ? 'Credit wallet' : 'Debit wallet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Send pay modal ─────────────────────────────────────────────────────────────

interface PayoutRow {
  worker_id: string;
  worker_display_name: string;
  worker_country: string | null;
  hours_logged: number;
  rate_per_hour: number;
  amount: number;
  currency: string;
  sent_at: string | null;
}

interface PayoutPeriod {
  period_id: string;
  label: string;
  status: 'calculated' | 'approved' | 'paid';
  start_date: string;
  end_date: string;
  rows: PayoutRow[];
}

interface SendResult {
  credited: number;
  skipped: number;
  approved: boolean;
  skipped_no_fx: string[];
}

function totalsByCurrency(rows: PayoutRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.currency, (map.get(r.currency) ?? 0) + Number(r.amount));
  return formatMoneyTotals(map);
}

function SendPayModal({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [periods, setPeriods] = useState<PayoutPeriod[] | null>(null);
  const [periodId, setPeriodId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PayoutPeriod[]>('/wallets/payouts')
      .then((list) => {
        setPeriods(list);
        const first = list.find((p) => p.rows.some((r) => !r.sent_at)) ?? list[0];
        if (first) setPeriodId(first.period_id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load pay to send.'));
  }, []);

  const period = periods?.find((p) => p.period_id === periodId) ?? null;
  const pending = useMemo(() => period?.rows.filter((r) => !r.sent_at) ?? [], [period]);

  useEffect(() => {
    setSelected(new Set(pending.map((r) => r.worker_id)));
  }, [pending]);

  const chosen = pending.filter((r) => selected.has(r.worker_id));
  const allChosen = pending.length > 0 && chosen.length === pending.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!period || chosen.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const r = await api.post<SendResult>('/wallets/payouts/send', {
        period_id: period.period_id,
        worker_ids: chosen.map((c) => c.worker_id),
      });
      const parts = [`Sent ${period.label} pay to ${r.credited} wallet${r.credited === 1 ? '' : 's'}.`];
      if (r.approved) parts.push('The month was approved first.');
      if (r.skipped_no_fx.length) parts.push(`${r.skipped_no_fx.length} skipped — no exchange rate for their wallet currency.`);
      onDone(parts.join(' '));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send pay.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Send pay to wallets</h2>
            <p className="text-xs text-theme-muted mt-0.5">
              Credits each worker&apos;s calculated net pay. Workers see it in their wallet history with the month and date received.
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {periods === null && !error ? (
            <div className="flex justify-center py-10"><SpinningDots size="md" className="text-emerald-accent" /></div>
          ) : periods && periods.length === 0 ? (
            <div className="text-center py-8">
              <Receipt size={24} className="mx-auto text-theme-muted mb-3" />
              <p className="text-theme-muted text-sm">Nothing to send yet. Calculate a month on the Payroll page first.</p>
            </div>
          ) : periods && (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Work month</label>
                <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="input-field">
                  {periods.map((p) => {
                    const left = p.rows.filter((r) => !r.sent_at).length;
                    return (
                      <option key={p.period_id} value={p.period_id}>
                        {p.label} — {left ? `${left} to send` : 'all sent'}
                      </option>
                    );
                  })}
                </select>
                {period && (
                  <p className="text-[11px] text-theme-muted mt-1.5">
                    Work dates {fmtDay(period.start_date)} – {fmtDay(period.end_date)}
                    {period.status === 'calculated' && ' · not approved yet — sending will approve it and lock exchange rates'}
                  </p>
                )}
              </div>

              {period && (
                <div className="rounded-xl border border-white/10 overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white/[0.03] border-b border-white/[0.06]">
                    <label className="flex items-center gap-2 text-xs text-theme-muted cursor-pointer">
                      <input type="checkbox" checked={allChosen} disabled={pending.length === 0}
                        onChange={() => setSelected(allChosen ? new Set() : new Set(pending.map((r) => r.worker_id)))} />
                      Select all not yet sent ({pending.length})
                    </label>
                    {chosen.length > 0 && (
                      <span className="text-xs font-bold text-emerald-accent">{totalsByCurrency(chosen)}</span>
                    )}
                  </div>
                  <div className="divide-y divide-white/[0.05]">
                    {period.rows.map((r) => {
                      const sent = !!r.sent_at;
                      return (
                        <label key={r.worker_id}
                          className={`flex items-center gap-3 px-3.5 py-3 ${sent ? 'opacity-70' : 'cursor-pointer hover:bg-white/[0.02]'}`}>
                          <input type="checkbox" disabled={sent}
                            checked={sent || selected.has(r.worker_id)}
                            onChange={() => toggle(r.worker_id)} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white truncate">{r.worker_display_name}</p>
                            <p className="text-[11px] text-theme-muted">
                              {fmtAmount(r.hours_logged)} h × {formatMoney(r.rate_per_hour, r.currency)}/hr
                              {r.worker_country ? ` · ${r.worker_country}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-white tabular-nums">{formatMoney(r.amount, r.currency)}</p>
                            {sent ? (
                              <p className="text-[10px] text-emerald-accent flex items-center gap-1 justify-end">
                                <CheckCircle size={10} /> Sent {new Date(r.sent_at as string).toLocaleDateString()}
                              </p>
                            ) : (
                              <p className="text-[10px] text-amber-400">Not sent</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end p-5 border-t border-white/[0.06] shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          <button type="button" onClick={send} disabled={sending || chosen.length === 0}
            className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {sending ? <SpinningDots size="sm" className="text-emerald-accent" /> : <Send size={14} />}
            {period?.status === 'calculated' ? 'Approve & send' : 'Send'} to {chosen.length} wallet{chosen.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WalletsPage() {
  useMoneyDisplay();
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [txWallet, setTxWallet] = useState<WalletRow | null>(null);
  const [adjustWallet, setAdjustWallet] = useState<WalletRow | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setWallets(await api.get<WalletRow[]>('/wallets'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load wallets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return wallets;
    return wallets.filter(
      (w) => w.worker_display_name.toLowerCase().includes(q) || w.worker_country.toLowerCase().includes(q),
    );
  }, [wallets, search]);

  const balancesByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of wallets) map.set(w.currency, (map.get(w.currency) ?? 0) + Number(w.balance));
    return map;
  }, [wallets]);
  const balanceChips = balancesByCurrency.size === 0 ? [] : moneyTotalsList(balancesByCurrency);

  const rows = filtered.map((w) => ({ id: w.id, _wallet: w }));

  return (
    <div>
      <PageHeader
        title="Worker Wallets"
        actions={
          <button type="button" onClick={() => { setNotice(null); setSendOpen(true); }}
            className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
            <Send size={14} /> Send pay to wallets
          </button>
        }
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      {notice && (
        <div className="flex items-center justify-between gap-3 p-3.5 mb-4 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-sm">
          <span className="flex items-center gap-2"><CheckCircle size={15} /> {notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-accent/70 hover:text-emerald-accent">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <KpiCard label="Total Wallets" value={wallets.length} icon={Wallet} accent="emerald" />
        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Balances by Currency</p>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-gold-accent bg-gold-accent/10">
              <Coins size={15} />
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {balanceChips.length === 0 ? (
              <p className="text-2xl font-black tracking-tight text-theme-heading">—</p>
            ) : (
              balanceChips.map((chip) => (
                <span key={chip}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border bg-white/5 text-white border-white/10">
                  {chip}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant" />
          <input
            type="text"
            placeholder="Search worker or country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white placeholder:text-theme-muted/60 focus:outline-none focus:border-emerald-accent/40 transition-colors w-full sm:w-56"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-white">
              <X size={12} />
            </button>
          )}
        </div>
        <span className="text-xs text-theme-muted ml-1">{filtered.length} wallet{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: 'worker', header: 'Worker',
              render: (r) => <span className="font-medium text-white">{(r._wallet as WalletRow).worker_display_name}</span>,
            },
            { key: 'country', header: 'Country', render: (r) => (r._wallet as WalletRow).worker_country },
            {
              key: 'balance', header: 'Balance',
              render: (r) => {
                const w = r._wallet as WalletRow;
                return <span className="font-bold text-white">{formatMoney(w.balance, w.currency)}</span>;
              },
            },
            {
              key: 'updated', header: 'Updated',
              render: (r) => (
                <span className="text-xs text-theme-muted">
                  {new Date((r._wallet as WalletRow).updated_at).toLocaleString()}
                </span>
              ),
            },
            {
              key: 'actions', header: '',
              render: (r) => {
                const w = r._wallet as WalletRow;
                return (
                  <div className="flex items-center gap-2 justify-end">
                    <button type="button" onClick={() => setTxWallet(w)}
                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                      <Receipt size={12} /> Transactions
                    </button>
                    <button type="button" onClick={() => setAdjustWallet(w)}
                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                      <ArrowLeftRight size={12} /> Adjust
                    </button>
                  </div>
                );
              },
            },
          ]}
          data={rows as unknown as Record<string, unknown>[]}
          emptyMessage="No wallets found. Wallets are created automatically per worker."
        />
      )}

      {sendOpen && (
        <SendPayModal
          onClose={() => setSendOpen(false)}
          onDone={(message) => { setSendOpen(false); setNotice(message); load(); }}
        />
      )}
      {txWallet && <TransactionsModal wallet={txWallet} onClose={() => setTxWallet(null)} />}
      {adjustWallet && (
        <AdjustModal
          wallet={adjustWallet}
          onClose={() => setAdjustWallet(null)}
          onDone={() => { setAdjustWallet(null); load(); }}
        />
      )}
    </div>
  );
}
