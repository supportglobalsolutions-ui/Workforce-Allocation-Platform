'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, ChevronRight, Paperclip, RefreshCw } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import NotificationTabs from '@/components/admin/NotificationTabs';
import { reportError } from '@/lib/errors';
import {
  ABSENCE_REASON_LABELS,
  listAbsenceReports,
  type AbsenceReport,
  type AbsenceStatus,
} from '@/lib/absence-reports';

type Filter = AbsenceStatus | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
  { key: 'all', label: 'All' },
];

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AbsenceReportsPage() {
  const [reports, setReports] = useState<AbsenceReport[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await listAbsenceReports(
        filter === 'all' ? undefined : { status: filter },
      );
      setReports(rows);
    } catch (err) {
      setError(reportError('Load absence reports', err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Shift-linked reports affect the roster today, so they lead the queue.
  const { linked, standalone } = useMemo(() => {
    return {
      linked: reports.filter((r) => r.shift_id),
      standalone: reports.filter((r) => !r.shift_id),
    };
  }, [reports]);

  const renderRow = (r: AbsenceReport) => {
    // Older or manually imported rows may not include the JSON array even
    // though new API responses do. A missing attachment list must not take
    // down the entire review queue.
    const attachments = Array.isArray(r.attachment_paths) ? r.attachment_paths : [];
    return (
      <Link
      key={r.id}
      href={`/admin/notifications/absences/${r.id}`}
      className="group block rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 transition-all duration-200 hover:border-amber-500/25 hover:bg-amber-500/[0.04]"
    >
      <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
        <div className="min-w-0 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-400">
            <AlertTriangle size={15} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {r.worker_name ?? 'Unknown worker'}
            </p>
            <p className="text-[11px] text-theme-muted truncate">
              {ABSENCE_REASON_LABELS[r.reason_category] ?? r.reason_category}
            </p>
          </div>
        </div>

        <p className="text-xs text-theme-muted truncate">{r.reason_text}</p>

        <p className="text-xs text-theme-muted font-mono truncate">
          {when(r.absence_start)}
        </p>

        <div className="flex items-center justify-between md:justify-end gap-2">
          {attachments.length > 0 ? (
            <span
              title={`${attachments.length} file(s) attached`}
              className="inline-flex items-center gap-1 text-[11px] text-theme-muted"
            >
              <Paperclip size={12} />
              {attachments.length}
            </span>
          ) : (
            <span className="text-[11px] text-theme-muted/60 italic">no evidence</span>
          )}
          <StatusBadge status={r.status} />
          <ChevronRight
            size={15}
            className="shrink-0 text-theme-muted opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
      </div>
      </Link>
    );
  };

  const section = (title: string, hint: string, rows: AbsenceReport[]) => (
    <section className="glass-panel rounded-2xl border border-white/5 p-5 md:p-6">
      <div className="mb-5 pb-4 border-b border-white/[0.06]">
        <h2 className="text-lg font-bold text-white tracking-tight">{title}</h2>
        <p className="text-xs text-theme-muted mt-1">
          {rows.length === 0 ? 'Nothing here' : `${rows.length} report${rows.length > 1 ? 's' : ''} — ${hint}`}
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center">
          <p className="text-sm text-theme-muted">Nothing to review.</p>
        </div>
      ) : (
        <div className="space-y-2 md:space-y-2.5">{rows.map(renderRow)}</div>
      )}
    </section>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Absence reports"
        description="Workers telling us ahead of time that they cannot work."
        actions={
          <button
            type="button"
            onClick={() => load()}
            className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />
      <NotificationTabs />

      <div className="flex flex-wrap items-center gap-1 bg-white/5 rounded-xl p-1 w-fit max-w-full">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              filter === f.key
                ? 'bg-white/10 text-theme-heading'
                : 'text-theme-muted hover:text-theme-heading'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-theme-muted animate-pulse">Loading absence reports…</p>
      ) : (
        <div className="space-y-5">
          {section(
            'Tied to a shift',
            'accepting one cancels that shift',
            linked,
          )}
          {section(
            'Not tied to a shift',
            'declared date ranges',
            standalone,
          )}
        </div>
      )}

      {!loading && reports.length === 0 && (
        <p className="flex items-center gap-2 text-xs text-theme-muted">
          <CalendarClock size={13} />
          Nothing matches this filter.
        </p>
      )}
    </div>
  );
}
