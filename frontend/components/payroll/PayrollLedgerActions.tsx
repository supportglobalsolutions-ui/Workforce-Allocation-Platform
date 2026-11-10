'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Calculator, CheckCircle, ChevronDown, RotateCcw, Send, Users, Wallet } from 'lucide-react';
import ConfirmModal, { FINANCE_CONFIRM_META } from '@/components/platform/ConfirmModal';
import MonthChecksPanel from '@/components/payroll/MonthChecksPanel';
import PayTotalsCards from '@/components/payroll/PayTotalsCards';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { MonthChecks } from '@/lib/client-billing';
import type { LedgerRow } from '@/components/admin/PeriodLedgerSheet';

type Action = 'calculate' | 'approve' | 'reopen' | 'push-wallets' | 'mark-paid';
type ConfirmAction = Extract<Action, 'approve' | 'push-wallets' | 'mark-paid'>;

interface Period {
  id: string;
  label: string;
  status: string;
  currency: string;
  approved_by?: string | null;
  wallet_pushed_at?: string | null;
  paid_at?: string | null;
}

interface Props {
  period: Period;
  rows: LedgerRow[];
  onApplyToMany: () => void;
  onUpdated: () => void;
}

export default function PayrollLedgerActions({ period, rows, onApplyToMany, onUpdated }: Props) {
  const { session } = useAuth();
  const isSuper = session?.authRole === 'super_admin';
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [showTotals, setShowTotals] = useState(true);
  const [checksKey, setChecksKey] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const onChecks = useCallback((c: MonthChecks) => setBlocked(c.blocked), []);

  const canCalculate = period.status === 'open' || period.status === 'calculated';
  const canApprove = period.status === 'calculated' && !blocked;
  const canReopen = period.status === 'calculated' || period.status === 'approved';
  const canPushWallets = period.status === 'approved';
  const canMarkPaid = period.status === 'approved';
  const locked = period.status === 'approved' || period.status === 'paid';

  const runAction = async (action: Action) => {
    setConfirmAction(null);
    setBusy(action);
    setMessage(null);
    try {
      const result = await api.post<Record<string, unknown> | null>(`/payroll/periods/${period.id}/${action}`, undefined);
      let text = '';
      if (action === 'calculate') {
        const pdfs = Number((result as { pdfs?: number } | null)?.pdfs ?? 0);
        text = pdfs > 0
          ? `Period calculated. Payslip rows and ${pdfs} PDF${pdfs === 1 ? '' : 's'} ready.`
          : 'Period calculated. Payslip rows refreshed below.';
      } else if (action === 'approve') text = 'Period approved — FX rates frozen at pay day.';
      else if (action === 'reopen') text = 'Period reopened for adjustments.';
      else if (action === 'push-wallets') {
        const resultData = result as { credited?: number; skipped?: number; skipped_no_fx?: string[] } | null;
        const missingRates = resultData?.skipped_no_fx?.length ?? 0;
        text = `Wallets pushed — ${resultData?.credited ?? 0} credited, ${resultData?.skipped ?? 0} skipped (already credited or zero net${missingRates ? `; ${missingRates} missing an exchange rate` : ''}).`;
      } else text = 'Period marked as paid.';
      setMessage({ kind: 'success', text });
      setChecksKey((k) => k + 1);
      onUpdated();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : `Failed to ${action.replace('-', ' ')}.` });
    } finally {
      setBusy(null);
    }
  };

  const allActions: { action: Action; label: string; icon: typeof Calculator; enabled: boolean; primary: boolean; title: string; superOnly?: boolean }[] = [
    { action: 'calculate', label: period.status === 'calculated' ? 'Recalculate' : 'Calculate', icon: Calculator, enabled: canCalculate, primary: false, title: 'Pull finished session hours into this month. Does not pay anyone.' },
    { action: 'approve', label: 'Approve', icon: CheckCircle, enabled: canApprove, primary: canApprove, superOnly: true, title: blocked ? 'Open month checks block approval: fix them or bypass with a reason.' : canApprove ? 'Lock this month and freeze FX. Required before Wallets.' : 'Calculate first, then Approve.' },
    { action: 'reopen', label: 'Reopen', icon: RotateCcw, enabled: canReopen, primary: false, superOnly: true, title: 'Unlock the month so you can edit payslips again. Does not delete rows.' },
    { action: 'push-wallets', label: 'Wallets', icon: Wallet, enabled: canPushWallets, primary: canPushWallets && !period.wallet_pushed_at, title: canPushWallets ? 'Credit each worker wallet with this month’s net pay.' : 'Approve this month first. Entering a rate does not credit wallets.' },
    { action: 'mark-paid', label: 'Mark Paid', icon: Send, enabled: canMarkPaid, primary: canMarkPaid && !!period.wallet_pushed_at, superOnly: true, title: canMarkPaid ? 'Mark the month paid after wallets are credited.' : 'Approve, then push Wallets, then Mark Paid.' },
  ];
  const actions = allActions.filter((a) => isSuper || !a.superOnly);

  const confirmMeta = confirmAction ? FINANCE_CONFIRM_META[confirmAction] : null;
  const confirmBody = confirmAction === 'approve'
    ? <>Approve <span className="font-semibold text-theme-heading">“{period.label}”</span>? This freezes FX rates at pay day. You can still reopen later until the month is marked paid.</>
    : confirmAction === 'push-wallets'
      ? <>Push payouts for <span className="font-semibold text-theme-heading">“{period.label}”</span> to worker wallets? Credits are idempotent — already-credited workers are skipped.</>
      : <>Mark <span className="font-semibold text-theme-heading">“{period.label}”</span> as paid? Reopening is no longer possible after this.</>;

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-2">
        {!locked && <button type="button" onClick={onApplyToMany} disabled={!rows.length}
          title="Set the same rate, bonus, cost or currency on many workers at once."
          className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 disabled:opacity-40">
          <Users size={13} /> Apply to many
        </button>}
        {actions.map(({ action, label, icon: Icon, enabled, primary, title }) => (
          <button key={action} type="button" onClick={() => action === 'approve' || action === 'push-wallets' || action === 'mark-paid' ? setConfirmAction(action) : void runAction(action)}
            disabled={!enabled || busy !== null} title={title}
            className={`${primary ? 'btn-primary' : 'btn-secondary'} text-xs py-2 px-3.5 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed`}>
            {busy === action ? <SpinningDots size="sm" /> : <Icon size={13} />}{label}
          </button>
        ))}
        <Link href="/admin/payroll/export" className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">Export</Link>
        <button type="button" aria-label={showTotals ? 'Hide country totals' : 'Show country totals'} aria-expanded={showTotals}
          aria-controls="finance-country-totals" onClick={() => setShowTotals((value) => !value)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold-accent/40 bg-gold-accent/10 text-gold-accent">
          <ChevronDown size={16} className={showTotals ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>
      {(period.approved_by || period.wallet_pushed_at || period.paid_at) && (
        <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-theme-muted">
          {period.approved_by && <span>Approved by: {period.approved_by}</span>}
          {period.wallet_pushed_at && <span>Wallets pushed: {new Date(period.wallet_pushed_at).toLocaleString()}</span>}
          {period.paid_at && <span>Paid: {new Date(period.paid_at).toLocaleString()}</span>}
        </div>
      )}
      {!isSuper && (period.status === 'calculated' || period.status === 'approved') && (
        <p className="mt-2 text-[11px] text-theme-muted">Approve, reopen and mark paid are for Super Admins.</p>
      )}
      <MonthChecksPanel hidden periodId={period.id} status={period.status} reloadKey={checksKey} onChange={onChecks} />
      {message && <div role="status" className={`mt-3 rounded-xl border p-3 text-xs ${message.kind === 'success' ? 'border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent' : 'border-danger/30 bg-danger/10 text-danger'}`}>{message.text}</div>}
      {showTotals && <div className="mt-3"><PayTotalsCards rows={rows} /></div>}
      {confirmAction && confirmMeta && <ConfirmModal open title={confirmMeta.title} body={confirmBody}
        confirmLabel={confirmMeta.confirmLabel} tone={confirmMeta.tone} icon={confirmMeta.icon}
        busy={busy === confirmAction} onCancel={() => { if (busy !== confirmAction) setConfirmAction(null); }}
        onConfirm={() => void runAction(confirmAction)} />}
    </div>
  );
}
