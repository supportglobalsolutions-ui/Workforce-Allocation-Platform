'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { SYSTEM_TABS } from '@/components/platform/AdminSectionTabs';
import DataAlert from '@/components/platform/DataAlert';
import AuditLogDetailModal, { AuditLogEyeButton, type AuditLogEntry } from '@/components/admin/AuditLogDetailModal';
import { api } from '@/lib/api';

type AuditLog = AuditLogEntry;

type LogFilter = 'all' | 'rdp' | 'admin';

function isRdpAccess(action: string) {
  return action === 'rdp.logged_in' || action === 'rdp.logged_out';
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [viewLog, setViewLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    api.get<AuditLog[]>('/audit?limit=500')
      .then(setLogs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load audit logs'))
      .finally(() => setLoading(false));
  }, []);

  const visibleLogs = useMemo(() => {
    if (filter === 'rdp') return logs.filter((log) => isRdpAccess(log.action));
    if (filter === 'admin') return logs.filter((log) => !isRdpAccess(log.action));
    return logs;
  }, [filter, logs]);

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="Who did what across desktops, training, workers, and admin actions. Entries cannot be edited or deleted."
      />
      <AdminSectionTabs tabs={SYSTEM_TABS} />

      <div className="flex flex-wrap gap-2 mb-4">
        {([
          ['all', 'All activity'],
          ['rdp', 'Desktop access'],
          ['admin', 'Admin actions'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-colors ${
              filter === value
                ? 'border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent'
                : 'border-theme bg-brand-surface-low text-theme-muted hover:text-theme-heading'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading activity…</p>
      ) : error ? (
        <DataAlert tone="error">{error}</DataAlert>
      ) : visibleLogs.length === 0 ? (
        <DataAlert>No activity recorded yet for this filter.</DataAlert>
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-theme">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">When</th>
                  <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Who</th>
                  <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">What happened</th>
                  <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden lg:table-cell">On</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">IP</th>
                  <th className="w-12 px-3 py-3"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleLogs.map((log) => (
                  <tr key={log.id} className="border-b border-theme/60 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-xs text-theme-muted whitespace-nowrap align-top">
                      {new Date(log.created_at).toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-3 font-medium text-theme-heading whitespace-nowrap align-top">
                      {log.actor_name || (log.actor_id ? 'Unknown user' : 'System')}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="text-sm text-theme-heading leading-snug">
                        {log.summary || log.action_label || log.action}
                      </p>
                      <p className="text-[11px] text-emerald-accent/90 mt-0.5 font-medium">
                        {log.action_label || log.action}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-theme-muted text-xs align-top hidden lg:table-cell">
                      {log.target_label || '—'}
                    </td>
                    <td className="px-4 py-3 text-theme-muted text-xs font-mono align-top hidden md:table-cell">
                      {log.ip_address || '—'}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <AuditLogEyeButton onClick={() => setViewLog(log)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {viewLog && <AuditLogDetailModal log={viewLog} onClose={() => setViewLog(null)} />}
    </div>
  );
}
