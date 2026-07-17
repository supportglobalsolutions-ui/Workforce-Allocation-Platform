'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { FINANCE_TABS, PAYROLL_SUBTABS } from '@/components/platform/AdminSectionTabs';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';

interface PayrollLineItem {
  id: string;
  worker_id: string;
  gross_amount: number;
  worker_net: number;
  gs_net: number;
  exception_flags: unknown[];
}

interface Worker {
  id: string;
  display_name: string;
}

export default function PayrollCalculationPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<PayrollLineItem[]>('/payroll/line-items'),
      api.get<Worker[]>('/workers'),
    ])
      .then(([items, workers]) => {
        const nameById = new Map(workers.map((w) => [w.id, w.display_name]));
        setRows(items.map((item) => ({
          worker: nameById.get(item.worker_id) ?? `${item.worker_id.slice(0, 8)}…`,
          hours: '—',
          gross: Number(item.gross_amount).toFixed(2),
          workerNet: Number(item.worker_net),
          gsNet: Number(item.gs_net),
          flags: item.exception_flags?.length ?? 0,
          status: (item.exception_flags?.length ?? 0) > 0 ? 'pending' : 'approved',
        })));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load payroll'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Payroll Calculation"
        description="Per-worker earnings with partner splits, GS revenue, exception flags, and approval status."
        actions={<button className="btn-primary text-sm">Approve Period</button>}
      />
      <AdminSectionTabs tabs={FINANCE_TABS} />
      <AdminSectionTabs tabs={PAYROLL_SUBTABS} />
      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading payroll...</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : (
        <DataTable
          columns={[
            { key: 'worker', header: 'Worker' },
            { key: 'hours', header: 'Hours', render: (r) => `${r.hours}` },
            { key: 'gross', header: 'Gross', render: (r) => `£${r.gross}` },
            { key: 'workerNet', header: 'Worker Net', render: (r) => <span className="text-emerald-accent">£{r.workerNet as number}</span> },
            { key: 'gsNet', header: 'GS Revenue', render: (r) => <span className="text-gold-accent">£{r.gsNet as number}</span> },
            { key: 'flags', header: 'Flags', render: (r) => (r.flags as number) > 0 ? <span className="text-danger font-bold">{r.flags as number}</span> : '—' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status as string} /> },
          ]}
          data={rows}
          emptyMessage="No payroll line items yet."
        />
      )}
    </div>
  );
}
