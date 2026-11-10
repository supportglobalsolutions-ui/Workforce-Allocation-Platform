'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronDown, ShieldAlert } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { MonthChecks } from '@/lib/client-billing';

/**
 * Mismatches that block approving the month, each with a link to fix it.
 * A Super Admin can bypass the open checks with a reason.
 */
export default function MonthChecksPanel({ periodId, status, reloadKey = 0, onChange, compact = false, hidden = false }: {
  periodId: string;
  status: string;
  reloadKey?: number;
  onChange?: (checks: MonthChecks) => void;
  compact?: boolean;
  hidden?: boolean;
}) {
  const { session } = useAuth();
  const [expanded, setExpanded] = useState(true);
  const detailsId = useId();
  const isSuper = session?.authRole === 'super_admin';
  const [checks, setChecks] = useState<MonthChecks | null>(null);
  const [loading, setLoading] = useState(true);
  const [bypassing, setBypassing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adopt = useCallback((data: MonthChecks) => { setChecks(data); onChange?.(data); }, [onChange]);

  useEffect(() => {
    if (!periodId) return;
    setLoading(true);
    api.get<MonthChecks>(`/payroll/periods/${periodId}/checks`)
      .then(adopt)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the month checks.'))
      .finally(() => setLoading(false));
  }, [periodId, reloadKey, adopt]);

  const submitBypass = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (reason.trim().length < 5) { setError('Give a reason of at least 5 characters.'); return; }
    setBusy(true);
    setError(null);
    try {
      adopt(await api.post<MonthChecks>(`/payroll/periods/${periodId}/bypass`, { reason: reason.trim() }));
      setBypassing(false);
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not bypass.');
    } finally {
      setBusy(false);
    }
  };

  if (hidden) return null;

  if (loading && !checks) {
    return <div className="flex justify-center py-4"><SpinningDots size="sm" className="text-emerald-accent" /></div>;
  }
  if (!checks) return error ? <p className="text-xs text-danger">{error}</p> : null;

  const done = status === 'approved' || status === 'paid';
  const issues = checks.issues;
  const blockingCount = issues.filter((i) => i.blocks !== false).length;
  const warnOnly = issues.length > 0 && blockingCount === 0;

  if (!issues.length) {
    return (
      <p className={`flex items-center gap-2 text-xs text-emerald-accent ${compact ? '' : 'rounded-xl border border-emerald-accent/30 bg-emerald-accent/5 p-3'}`}>
        <CheckCircle2 size={14} /> All month checks pass.
      </p>
    );
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${checks.blocked ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/10 bg-white/[0.02]'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`flex items-center gap-2 text-sm font-semibold ${checks.blocked ? 'text-amber-400' : 'text-theme-heading'}`}>
          <AlertTriangle size={14} />
          {issues.length} open check{issues.length === 1 ? '' : 's'}
          {checks.blocked
            ? (done ? '' : ' block approving this month')
            : warnOnly
              ? ' (warnings only — do not block approval)'
              : ' (bypassed)'}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setExpanded(value => !value)}
            aria-expanded={expanded} aria-controls={detailsId}
            className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1.5">
            <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? 'Hide checks' : 'Show checks'}
          </button>
        {isSuper && checks.blocked && !done && !bypassing && (
          <button type="button" onClick={() => setBypassing(true)}
            className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1.5">
            <ShieldAlert size={12} /> Bypass
          </button>
        )}
        </div>
      </div>
      <div id={detailsId} hidden={!expanded}>
      <ul className="space-y-1">
        {issues.map((i) => (
          <li key={i.key} className="flex items-start justify-between gap-3 text-xs">
            <span className="text-theme-heading">
              {i.blocks === false && <span className="text-theme-muted mr-1">Warning:</span>}
              {i.message}
            </span>
            {i.href && (
              <Link href={i.href} className="shrink-0 inline-flex items-center gap-0.5 font-semibold text-emerald-accent hover:underline">
                Resolve <ArrowUpRight size={11} />
              </Link>
            )}
          </li>
        ))}
      </ul>
      </div>
      {checks.bypass && (
        <p className="text-[11px] text-theme-muted">
          Bypassed by {checks.bypass.by ?? 'a Super Admin'}{checks.bypass.at ? ` on ${new Date(checks.bypass.at).toLocaleString()}` : ''}: “{checks.bypass.reason}”.
          {checks.blocked && ' New checks have opened since.'}
        </p>
      )}
      {bypassing && (
        <form onSubmit={submitBypass} className="space-y-2 pt-1">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Why approve with these open?</span>
            <textarea autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000}
              className="input-field w-full mt-1 text-sm" />
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setBypassing(false); setError(null); }} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5">
              {busy ? <SpinningDots size="sm" /> : <ShieldAlert size={12} />} Bypass checks
            </button>
          </div>
        </form>
      )}
      {!isSuper && checks.blocked && !done && (
        <p className="text-[11px] text-theme-muted">Fix these, or ask a Super Admin to bypass them.</p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
