'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
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

const TYPE_LABELS: Record<string, string> = {
  gs_registered: 'GS Registered',
  partner_worker: 'Partner Worker',
};

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}

function WorkerDetailModal({ worker, onClose }: { worker: Worker; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
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
              <DetailField
                label="Start Date"
                value={new Date(worker.start_date).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              />
              <DetailField
                label="Created"
                value={new Date(worker.created_at).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
              />
              <DetailField
                label="Last Updated"
                value={new Date(worker.updated_at).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
              />
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
      </div>
    </div>
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
    partner: w.partner_entity_id ? w.partner_entity_id.slice(0, 8) + '…' : '—',
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
                  className="text-xs text-emerald-accent hover:underline"
                  onClick={() => setSelectedWorker((r as typeof rows[number])._worker)}
                >
                  View
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
