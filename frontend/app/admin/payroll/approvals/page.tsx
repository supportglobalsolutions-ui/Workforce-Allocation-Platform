'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Search, ShieldCheck } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import PeriodFilter from '@/components/platform/PeriodFilter';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { pickCurrentPeriod } from '@/lib/periods';

interface Period {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
  is_current?: boolean;
}

interface Member {
  worker_id: string;
  display_name: string;
  public_code: string | null;
  status: string;
  worker_type: string;
  currency: string;
  approved: boolean;
  approved_at: string | null;
}

interface ApprovalsOut {
  period_label: string;
  is_current: boolean;
  member_approval_required: boolean;
  members: Member[];
}

type Filter = 'all' | 'approved' | 'unapproved';

export default function MonthlyApprovalsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [data, setData] = useState<ApprovalsOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get<Period[]>('/payroll/periods')
      .then((list) => {
        setPeriods(list);
        if (list.length) setPeriodId(pickCurrentPeriod(list)?.id ?? list[0].id);
        else setLoading(false);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Failed to load work months'); setLoading(false); });
  }, []);

  const load = useCallback(() => {
    if (!periodId) return;
    setLoading(true);
    api.get<ApprovalsOut>(`/member-approvals/periods/${periodId}`)
      .then((d) => { setData(d); setSelected(new Set()); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load members'))
      .finally(() => setLoading(false));
  }, [periodId]);

  useEffect(() => { load(); }, [load]);

  const members = data?.members ?? [];
  const approvedCount = members.filter((m) => m.approved).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (filter === 'approved' && !m.approved) return false;
      if (filter === 'unapproved' && m.approved) return false;
      if (!q) return true;
      return m.display_name.toLowerCase().includes(q) || (m.public_code || '').toLowerCase().includes(q);
    });
  }, [members, search, filter]);

  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.worker_id));

  const run = async (body: { worker_ids?: string[]; approved: boolean; all_members?: boolean }, verb: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ changed: number }>(`/member-approvals/periods/${periodId}`, body);
      setNotice(`${verb} ${res.changed} member${res.changed === 1 ? '' : 's'}.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleRequired = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/member-approvals/periods/${periodId}/settings`, {
        member_approval_required: !data.member_approval_required,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Monthly Approvals"
        description="Approve who takes part in this working month. Approved members get tracking and RDP access; everyone else stays listed as Unapproved and cannot reach RDPs, RDP details or shifts."
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      <div className="glass-panel p-4 mb-6 grid gap-4 sm:grid-cols-2 items-end">
        <PeriodFilter periods={periods} value={periodId} onChange={setPeriodId} variant="select" label="Working month" />
        {data && (
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={data.member_approval_required} disabled={busy} onChange={() => void toggleRequired()} />
              Require approval this month
            </label>
          </div>
        )}
      </div>

      {data && !data.member_approval_required && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-white/[0.04] border border-white/10 text-theme-muted text-sm">
          <AlertCircle size={14} /> Approval is switched off for {data.period_label} — every active member has access. Approvals you set here take effect once it is switched on.
        </div>
      )}
      {data && data.member_approval_required && !data.is_current && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-white/[0.04] border border-white/10 text-theme-muted text-sm">
          <AlertCircle size={14} /> {data.period_label} is not the current working month, so these approvals only control access once it becomes current.
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-sm">
          <Check size={14} /> {notice}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : !data ? (
        <p className="text-theme-muted text-sm">No working months yet.</p>
      ) : (
        <div className="glass-panel p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-theme-muted">
              <span className="text-theme-heading font-semibold">{approvedCount}</span> of {members.length} approved for {data.period_label}
            </p>
            <button
              type="button"
              disabled={busy || approvedCount === members.length}
              onClick={() => void run({ approved: true, all_members: true }, 'Approved')}
              className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2"
            >
              <ShieldCheck size={14} /> Approve all
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…" className="input-field pl-9 w-full" />
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="input-field w-full sm:w-auto">
              <option value="all">Everyone</option>
              <option value="unapproved">Unapproved</option>
              <option value="approved">Approved</option>
            </select>
            <button
              type="button"
              disabled={busy || !selected.size}
              onClick={() => void run({ worker_ids: Array.from(selected), approved: true }, 'Approved')}
              className="btn-primary text-xs py-2 px-3"
            >
              Approve selected ({selected.size})
            </button>
            <button
              type="button"
              disabled={busy || !selected.size}
              onClick={() => void run({ worker_ids: Array.from(selected), approved: false }, 'Unapproved')}
              className="btn-secondary text-xs py-2 px-3"
            >
              Unapprove selected
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-white/10">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="sticky top-0 bg-brand-surface-lowest">
                <tr className="border-b border-white/[0.06]">
                  <th className="px-3 py-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      aria-label="Select all shown"
                      onChange={() => {
                        const next = new Set(selected);
                        if (allVisibleSelected) visible.forEach((m) => next.delete(m.worker_id));
                        else visible.forEach((m) => next.add(m.worker_id));
                        setSelected(next);
                      }}
                    />
                  </th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-theme-muted">Member</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-theme-muted">Type</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-theme-muted">This month</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-theme-muted text-xs">No members match.</td></tr>
                ) : visible.map((m) => (
                  <tr key={m.worker_id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(m.worker_id)}
                        aria-label={m.display_name}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(m.worker_id)) next.delete(m.worker_id);
                          else next.add(m.worker_id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-theme-heading">{m.display_name}</div>
                      <div className="text-[11px] text-theme-muted">
                        {[m.public_code, m.currency, m.status !== 'active' ? m.status : null].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-theme-muted text-xs">{m.worker_type === 'partner_worker' ? 'Partner' : 'GS member'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        m.approved
                          ? 'text-emerald-accent border-emerald-accent/30 bg-emerald-accent/10'
                          : 'text-amber-400 border-amber-400/30 bg-amber-400/10'
                      }`}>
                        {m.approved ? 'Approved' : 'Unapproved'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
