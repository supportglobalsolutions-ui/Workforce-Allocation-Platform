'use client';

import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import { DollarSign, Users, TrendingUp, PieChart } from 'lucide-react';

export default function FinancialIntelligencePage() {
  return (
    <div>
      <PageHeader
        title="Financial Intelligence"
        description="Partner revenue, worker revenue, payroll costs, and profit trend analysis."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Gross Revenue" value="—" icon={DollarSign} accent="gold" />
        <KpiCard label="Worker Payouts" value="—" icon={Users} />
        <KpiCard label="Payroll Costs" value="—" icon={PieChart} />
        <KpiCard label="Net Profit" value="—" icon={TrendingUp} accent="gold" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h2 className="font-bold text-white mb-4">Revenue by Partner</h2>
          <p className="text-sm text-brand-on-surface-variant">No partner revenue data available yet.</p>
        </div>
        <div className="glass-panel p-6">
          <h2 className="font-bold text-white mb-4">Profit Trends</h2>
          <p className="text-sm text-brand-on-surface-variant">No profit trend data available yet.</p>
        </div>
      </div>
    </div>
  );
}
