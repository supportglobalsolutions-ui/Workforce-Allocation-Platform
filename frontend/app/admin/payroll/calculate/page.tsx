'use client';

import PageHeader from '@/components/platform/PageHeader';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import { payrollRows } from '@/lib/mock-data';

export default function PayrollCalculationPage() {
  return (
    <div>
      <PageHeader
        title="Payroll Calculation"
        description="Per-worker earnings with partner splits, GS revenue, exception flags, and approval status."
        actions={<button className="btn-primary text-sm">Approve Period</button>}
      />
      <DataTable
        columns={[
          { key: 'worker', header: 'Worker' },
          { key: 'hours', header: 'Hours', render: (r) => `${r.hours}h` },
          { key: 'gross', header: 'Gross', render: (r) => `£${r.gross}` },
          { key: 'workerNet', header: 'Worker Net', render: (r) => <span className="text-emerald-accent">£{r.workerNet as number}</span> },
          { key: 'gsNet', header: 'GS Revenue', render: (r) => <span className="text-gold-accent">£{r.gsNet as number}</span> },
          { key: 'flags', header: 'Flags', render: (r) => (r.flags as number) > 0 ? <span className="text-danger font-bold">{r.flags as number}</span> : '—' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status as string} /> },
        ]}
        data={payrollRows as Record<string, unknown>[]}
      />
    </div>
  );
}
