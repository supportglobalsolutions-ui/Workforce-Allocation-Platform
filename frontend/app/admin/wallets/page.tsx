'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeftRight, Coins, Receipt, Search, Wallet, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import DataTable from '@/components/platform/DataTable';
import KpiCard from '@/components/platform/KpiCard';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

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
  note: string | null;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtAmount = (x: number) =>
  Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
              Balance: <span className="text-white font-bold">{wallet.currency} {fmtAmount(wallet.balance)}</span>
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
                      {t.note && <p className="text-xs text-theme-muted mt-1.5">{t.note}</p>}
                      <p className="text-[10px] text-theme-muted/70 mt-1">{new Date(t.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`shrink-0 text-sm font-bold ${positive ? 'text-emerald-accent' : 'text-danger'}`}>
                      {positive ? '+' : '−'}{t.currency} {fmtAmount(Math.abs(Number(t.amount)))}
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

          <div className="grid grid-cols-2 gap-3">
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [txWallet, setTxWallet] = useState<WalletRow | null>(null);
  const [adjustWallet, setAdjustWallet] = useState<WalletRow | null>(null);

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
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [wallets]);

  const rows = filtered.map((w) => ({ id: w.id, _wallet: w }));

  return (
    <div>
      <PageHeader
        title="Worker Wallets"
        description="Wallets are credited when a payroll period is pushed; admins can make manual adjustments with a reason."
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

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
            {balancesByCurrency.length === 0 ? (
              <p className="text-2xl font-black tracking-tight text-theme-heading">—</p>
            ) : (
              balancesByCurrency.map(([cur, total]) => (
                <span key={cur}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border bg-white/5 text-white border-white/10">
                  {cur} {fmtAmount(total)}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant" />
          <input
            type="text"
            placeholder="Search worker or country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white placeholder:text-theme-muted/60 focus:outline-none focus:border-emerald-accent/40 transition-colors w-56"
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
                return <span className="font-bold text-white">{w.currency} {fmtAmount(w.balance)}</span>;
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
