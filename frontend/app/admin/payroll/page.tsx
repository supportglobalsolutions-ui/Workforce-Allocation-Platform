'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import PayrollTabs from '@/components/platform/PayrollTabs';
import { DollarSign, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface PayrollPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface PayrollLineItem {
  id: string;
  exception_flags: unknown[];
  worker_net: number;
}

export default function PayrollDashboardPage() {
  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [exceptionCount, setExceptionCount] = useState(0);
  const [totalPayroll, setTotalPayroll] = useState('—');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<PayrollPeriod[]>('/payroll/periods'),
      api.get<PayrollLineItem[]>('/payroll/line-items'),
    ])
      .then(([periods, items]) => {
        setPeriod(periods[0] ?? null);
        setExceptionCount(items.filter((i) => (i.exception_flags?.length ?? 0) > 0).length);
        if (items.length > 0) {
          const total = items.reduce((sum, i) => sum + Number(i.worker_net ?? 0), 0);
          setTotalPayroll(`£${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load payroll'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-theme-muted text-sm mt-4">Loading payroll...</p>;
  if (error) return <p className="text-danger text-sm mt-4">{error}</p>;

  return (
    <div>
      <PageHeader
        title="Payroll Dashboard"
        description="Current payroll period overview, pending reviews, exception alerts, and total payroll."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/payroll/calculate" className="btn-secondary text-sm">Calculate</Link>
            <Link href="/admin/payroll/receipts" className="btn-secondary text-sm">Send Receipts</Link>
            <Link href="/admin/payroll/export" className="btn-primary text-sm">Export</Link>
          </div>
        }
      />
      <PayrollTabs active="/admin/payroll" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Current Period" value={period?.label ?? '—'} icon={Clock} />
        <KpiCard label="Pending Reviews" value="—" icon={AlertTriangle} accent="gold" />
        <KpiCard label="Exception Alerts" value={exceptionCount} icon={AlertTriangle} accent="danger" />
        <KpiCard label="Total Payroll" value={totalPayroll} icon={DollarSign} accent="gold" />
      </div>
      <div className="glass-panel p-6">
        <h2 className="text-sm font-bold text-white mb-4">Period Status</h2>
        {period ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle size={20} className="text-success" />
              <span className="text-white">
                Period {period.label}: {new Date(period.start_date).toLocaleDateString()} – {new Date(period.end_date).toLocaleDateString()}
              </span>
              <StatusBadgeInline status={period.status} />
            </div>
            <p className="text-sm text-brand-on-surface-variant">
              Payroll period loaded from the database.
            </p>
          </>
        ) : (
          <p className="text-sm text-brand-on-surface-variant">No payroll periods configured yet.</p>
        )}
      </div>
    </div>
  );
}

function StatusBadgeInline({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-warning/10 text-warning border-warning/30',
    approved: 'bg-success/10 text-success border-success/30',
    closed: 'bg-white/10 text-white/60 border-white/10',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[status] ?? colors.open}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
