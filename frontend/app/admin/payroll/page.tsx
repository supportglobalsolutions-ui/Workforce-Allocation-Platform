'use client';

import Link from 'next/link';
import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import { DollarSign, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

export default function PayrollDashboardPage() {
  return (
    <div>
      <PageHeader
        title="Payroll Dashboard"
        description="Current payroll period overview, pending reviews, exception alerts, and total payroll."
        actions={
          <div className="flex gap-2">
            <Link href="/admin/payroll/calculate" className="btn-secondary text-sm">Calculate</Link>
            <Link href="/admin/payroll/export" className="btn-primary text-sm">Export</Link>
          </div>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Current Period" value="2026-05" icon={Clock} />
        <KpiCard label="Pending Reviews" value={12} icon={AlertTriangle} accent="gold" />
        <KpiCard label="Exception Alerts" value={3} icon={AlertTriangle} accent="danger" />
        <KpiCard label="Total Payroll" value="£284,750" icon={DollarSign} accent="gold" />
      </div>
      <div className="glass-panel p-6">
        <h2 className="text-sm font-bold text-white mb-4">Period Status</h2>
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle size={20} className="text-success" />
          <span className="text-white">Period 2026-05: May 1 – May 31, 2026</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/30">Review in progress</span>
        </div>
        <p className="text-sm text-brand-on-surface-variant">
          847 approved sessions · 3 exception flags · Variable splits applied per partner arrangement
        </p>
      </div>
    </div>
  );
}
