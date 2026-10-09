'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import NotificationTabs from '@/components/admin/NotificationTabs';
import ShiftRequestReviewModal from '@/components/shifts/ShiftRequestReviewModal';
import { reportError } from '@/lib/errors';
import {
  listShiftRequests,
  shiftWindow,
  type ShiftChangeRequest,
  type ShiftRequestStatus,
} from '@/lib/shift-requests';

type Filter = ShiftRequestStatus | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Withdrawn' },
  { key: 'all', label: 'All' },
];

/** Workers asking to move or delete shifts an admin already approved. */
export default function ShiftChangesPage() {
  const [rows, setRows] = useState<ShiftChangeRequest[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<ShiftChangeRequest | null>(null);
  // Bumped after a decision so the tab badge recounts.
  const [tabsKey, setTabsKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listShiftRequests(filter === 'all' ? undefined : filter));
    } catch (err) {
      setError(reportError('Load shift change requests', err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shift changes"
        description="Workers asking to change the hours of, or delete, a shift you already approved. Approving applies it straight away; the worker is notified either way."
        actions={
          <button type="button" onClick={() => void load()} className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />
      <NotificationTabs key={tabsKey} />

      <div className="flex flex-wrap items-center gap-1 bg-white/5 rounded-xl p-1 w-fit max-w-full">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              filter === f.key ? 'bg-white/10 text-theme-heading' : 'text-theme-muted hover:text-theme-heading'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {toast && <p className="text-sm text-emerald-accent">{toast}</p>}

      {loading ? (
        <p className="text-sm text-theme-muted animate-pulse">Loading shift change requests…</p>
      ) : rows.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
          <p className="text-sm text-theme-muted flex items-center justify-center gap-2">
            <CalendarClock size={14} />
            {filter === 'pending' ? 'No requests waiting for review.' : 'Nothing matches this filter.'}
          </p>
        </div>
      ) : (
        <section className="glass-panel rounded-2xl border border-white/5 p-4 md:p-5 space-y-2">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setOpen(r)}
              className="group w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 transition-all hover:border-danger/25 hover:bg-danger/[0.04]"
            >
              <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.3fr)_auto] md:items-center md:gap-4">
                <div className="min-w-0 flex items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-black ${
                    r.status === 'pending' ? 'border-danger/40 bg-danger/15 text-danger' : 'border-white/10 bg-white/5 text-theme-muted'
                  }`}>
                    {r.kind === 'delete' ? <Trash2 size={14} /> : '!'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-theme-heading truncate">{r.worker_name ?? 'Unknown worker'}</p>
                    <p className="text-[11px] text-theme-muted">{r.kind === 'delete' ? 'Wants to delete' : 'Wants new times'}</p>
                  </div>
                </div>
                <div className="min-w-0 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`text-theme-muted ${r.kind === 'delete' ? 'line-through' : ''}`}>{shiftWindow(r.old_start, r.old_end)}</span>
                  <ArrowRight size={12} className="text-theme-muted" />
                  {r.kind === 'delete' ? (
                    <span className="font-semibold text-danger">Delete</span>
                  ) : (
                    <span className="font-semibold text-amber-400">{shiftWindow(r.new_start, r.new_end)}</span>
                  )}
                </div>
                <p className="text-xs text-theme-muted truncate" title={r.reason ?? undefined}>
                  {r.reason || <span className="italic opacity-60">No reason given</span>}
                </p>
                <div className="flex items-center justify-between md:justify-end gap-2">
                  <span className="text-[11px] text-theme-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                  <StatusBadge status={r.status === 'cancelled' ? 'withdrawn' : r.status} />
                  <ChevronRight size={15} className="shrink-0 text-theme-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>
            </button>
          ))}
        </section>
      )}

      <p className="text-xs text-theme-muted">
        Requests also show as a red <span className="font-bold text-danger">!</span> on{' '}
        <Link href="/admin/shifts" className="underline hover:no-underline">Shifts</Link>.
      </p>

      <ShiftRequestReviewModal
        request={open}
        onClose={() => setOpen(null)}
        onDecided={(updated) => {
          setOpen(null);
          setToast(
            updated.status === 'approved'
              ? `Approved — ${updated.kind === 'delete' ? 'the shift was cancelled' : 'the new times are live'} and ${updated.worker_name ?? 'the worker'} was notified.`
              : `Rejected — ${updated.worker_name ?? 'the worker'} was notified.`,
          );
          setTabsKey((k) => k + 1);
          void load();
        }}
      />
    </div>
  );
}
