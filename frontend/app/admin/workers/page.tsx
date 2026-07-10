'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, Plus, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import SessionDetailPanel from '@/components/rdp/SessionDetailPanel';
import { api } from '@/lib/api';

interface Worker {
  id: string;
  display_name: string;
  country: string;
  worker_type: string;
  partner_entity_id: string | null;
  admin_user_id: string | null;
  pay_tier: string;
  status: string;
  start_date: string;
  created_at: string;
  updated_at: string;
}

interface WorkSession {
  id: string;
  session_type: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  close_status: string | null;
  rdp_resource_id: string | null;
  start_image_url: string | null;
  end_image_url: string | null;
}

interface RDPResource {
  id: string;
  nickname: string;
}

const TYPE_LABELS: Record<string, string> = {
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

function formatDuration(minutes: number | null): string {
  if (!minutes) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}

type ModalTab = 'profile' | 'sessions';

function WorkerDetailModal({ worker, onClose }: { worker: Worker; onClose: () => void }) {
  const [tab, setTab] = useState<ModalTab>('profile');
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'sessions' || sessions.length > 0) return;
    setSessionsLoading(true);
    setSessionsError(null);
    Promise.all([
      api.get<WorkSession[]>(`/sessions?worker_id=${worker.id}&limit=200`),
      api.get<RDPResource[]>('/rdp'),
    ])
      .then(([s, m]) => { setSessions(s); setMachines(m); })
      .catch((e) => setSessionsError(e instanceof Error ? e.message : 'Failed to load sessions'))
      .finally(() => setSessionsLoading(false));
  }, [tab, worker.id, sessions.length]);

  const machineName = (id: string | null) => {
    if (!id) return '—';
    return machines.find((m) => m.id === id)?.nickname ?? id.slice(0, 8) + '…';
  };

  const sessionRows = sessions.map((s) => ({
    id: s.id,
    date: new Date(s.start_time).toLocaleString(),
    machine: machineName(s.rdp_resource_id),
    duration: formatDuration(s.duration_minutes),
    type: TYPE_LABELS[s.session_type] ?? s.session_type,
    status: s.close_status ?? (s.end_time ? 'completed' : 'active'),
    start_image_url: s.start_image_url,
    end_image_url: s.end_image_url,
  }));

  const selectedSession = selectedSessionId
    ? sessionRows.find((r) => r.id === selectedSessionId) ?? null
    : null;

  const handleImageUploaded = (sessionId: string, type: 'start' | 'end', url: string) => {
    setSessions((prev) =>
      prev.map((s) => s.id === sessionId ? { ...s, [`${type}_image_url`]: url } : s),
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-white/[0.06] shrink-0">
            <div>
              <h2 className="text-base font-bold text-white">{worker.display_name}</h2>
              <p className="text-xs text-theme-muted mt-0.5">{TYPE_LABELS[worker.worker_type] ?? worker.worker_type}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06] px-5 shrink-0">
            {(['profile', 'sessions'] as ModalTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? 'text-emerald-400 border-emerald-400'
                    : 'text-theme-muted border-transparent hover:text-white'
                }`}
              >
                {t === 'profile' ? 'Profile' : 'Sessions & Images'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="overflow-y-auto flex-1">
            {tab === 'profile' && (
              <div className="p-5 space-y-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gold-accent mb-3">Identity</p>
                  <div className="grid grid-cols-2 gap-4">
                    <DetailField label="Display Name" value={worker.display_name} />
                    <DetailField label="Country" value={worker.country} />
                    <DetailField label="Worker Type" value={TYPE_LABELS[worker.worker_type] ?? worker.worker_type} />
                    <DetailField
                      label="Status"
                      value={<StatusBadge status={worker.status === 'active' ? 'approved' : 'offline'} label={worker.status} />}
                    />
                  </div>
                </div>
                <div className="border-t border-white/[0.06]" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gold-accent mb-3">Employment</p>
                  <div className="grid grid-cols-2 gap-4">
                    <DetailField label="Pay Tier" value={worker.pay_tier} />
                    <DetailField label="Start Date" value={new Date(worker.start_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} />
                    <DetailField label="Created" value={new Date(worker.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} />
                    <DetailField label="Last Updated" value={new Date(worker.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} />
                  </div>
                </div>
                <div className="border-t border-white/[0.06]" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gold-accent mb-3">Reference IDs</p>
                  <div className="space-y-3">
                    <DetailField label="Worker ID" value={<span className="font-mono text-xs break-all">{worker.id}</span>} />
                    {worker.admin_user_id && (
                      <DetailField label="Admin User ID" value={<span className="font-mono text-xs break-all">{worker.admin_user_id}</span>} />
                    )}
                    {worker.partner_entity_id && (
                      <DetailField label="Partner Entity ID" value={<span className="font-mono text-xs break-all">{worker.partner_entity_id}</span>} />
                    )}
                  </div>
                </div>
              </div>
            )}

            {tab === 'sessions' && (
              <div className="p-5">
                {sessionsLoading ? (
                  <p className="text-theme-muted text-sm">Loading sessions…</p>
                ) : sessionsError ? (
                  <p className="text-danger text-sm">{sessionsError}</p>
                ) : sessions.length === 0 ? (
                  <p className="text-theme-muted text-sm">No sessions found for this worker.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-theme-muted mb-3">{sessions.length} session{sessions.length !== 1 ? 's' : ''} — click the eye icon to view images</p>
                    <DataTable
                      columns={[
                        { key: 'date', header: 'Date' },
                        { key: 'machine', header: 'Machine' },
                        { key: 'duration', header: 'Duration' },
                        { key: 'type', header: 'Type' },
                        {
                          key: 'status',
                          header: 'Status',
                          render: (r) => <StatusBadge status={r.status as string} />,
                        },
                        {
                          key: 'images',
                          header: 'Images',
                          render: (r) => {
                            const hasStart = !!(r.start_image_url as string | null);
                            const hasEnd = !!(r.end_image_url as string | null);
                            return (
                              <span className="text-xs font-mono text-theme-muted">
                                {hasStart ? '▣' : '□'} {hasEnd ? '▣' : '□'}
                              </span>
                            );
                          },
                        },
                        {
                          key: 'id',
                          header: '',
                          render: (r) => (
                            <button
                              type="button"
                              onClick={() => setSelectedSessionId(r.id as string)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                              style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}
                              title="View session details & images"
                            >
                              <Eye size={14} />
                            </button>
                          ),
                        },
                      ]}
                      data={sessionRows as unknown as Record<string, unknown>[]}
                      emptyMessage="No sessions."
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Session detail panel (rendered outside the modal so it stacks above) */}
      <SessionDetailPanel
        session={selectedSession}
        onClose={() => setSelectedSessionId(null)}
        onImageUploaded={handleImageUploaded}
      />
    </>
  );
}

export default function WorkerManagementPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  useEffect(() => {
    api.get<Worker[]>('/workers')
      .then(setWorkers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load workers'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter((w) => {
      if (typeFilter && (TYPE_LABELS[w.worker_type] ?? w.worker_type) !== typeFilter) return false;
      if (statusFilter && w.status !== statusFilter.toLowerCase()) return false;
      if (!q) return true;
      return (
        w.display_name.toLowerCase().includes(q) ||
        w.country.toLowerCase().includes(q) ||
        w.pay_tier.toLowerCase().includes(q)
      );
    });
  }, [workers, search, typeFilter, statusFilter]);

  const rows = filtered.map((w) => ({
    id: w.id,
    name: w.display_name,
    country: w.country,
    type: TYPE_LABELS[w.worker_type] ?? w.worker_type,
    pay_tier: w.pay_tier,
    start_date: new Date(w.start_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    status: w.status,
    _worker: w,
  }));

  return (
    <div>
      <PageHeader
        title="Worker Management"
        description="View and manage worker profiles across all types and countries."
        actions={<button className="btn-primary flex items-center gap-2"><Plus size={16} />Create Worker</button>}
      />
      <FilterBar
        searchPlaceholder="Search by name, country, pay tier…"
        onSearch={setSearch}
        onFilterChange={(label, value) => {
          if (label === 'Type') setTypeFilter(value);
          if (label === 'Status') setStatusFilter(value);
        }}
        filters={[
          { label: 'Type', options: ['GS Registered', 'Partner Worker'] },
          { label: 'Status', options: ['Active', 'Inactive', 'Suspended'] },
        ]}
      />

      {selectedWorker && (
        <WorkerDetailModal worker={selectedWorker} onClose={() => setSelectedWorker(null)} />
      )}

      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading workers…</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : (
        <DataTable
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'country', header: 'Country' },
            { key: 'type', header: 'Type' },
            { key: 'pay_tier', header: 'Pay Tier' },
            { key: 'start_date', header: 'Start Date' },
            {
              key: 'status',
              header: 'Status',
              render: (r) => (
                <StatusBadge
                  status={r.status === 'active' ? 'approved' : 'offline'}
                  label={r.status as string}
                />
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (r) => (
                <button
                  type="button"
                  onClick={() => setSelectedWorker((r as typeof rows[number])._worker)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                  style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}
                  title="View worker details & sessions"
                >
                  <Eye size={14} />
                </button>
              ),
            },
          ]}
          data={rows as unknown as Record<string, unknown>[]}
          emptyMessage="No workers yet."
        />
      )}
    </div>
  );
}
