'use client';

import PageHeader from '@/components/platform/PageHeader';
import KpiCard from '@/components/platform/KpiCard';
import { DollarSign, Users, TrendingUp, PieChart } from 'lucide-react';
import { partners } from '@/lib/mock-data';

export default function FinancialIntelligencePage() {
  return (
    <div>
      <PageHeader
        title="Financial Intelligence"
        description="Partner revenue, worker revenue, payroll costs, and profit trend analysis."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Gross Revenue" value="£284.7K" icon={DollarSign} accent="gold" />
        <KpiCard label="Worker Payouts" value="£198.2K" icon={Users} />
        <KpiCard label="Payroll Costs" value="£42.1K" icon={PieChart} />
        <KpiCard label="Net Profit" value="£44.4K" change="+11%" icon={TrendingUp} accent="gold" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h2 className="font-bold text-white mb-4">Revenue by Partner</h2>
          {partners.map((p) => (
            <div key={p.id} className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-white">{p.name}</span>
                <span className="text-gold-accent font-mono">£{p.revenue.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gold-accent/60 rounded-full" style={{ width: `${(p.revenue / 48200) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="glass-panel p-6">
          <h2 className="font-bold text-white mb-4">Profit Trends</h2>
          <div className="h-48 flex items-end gap-2">
            {[55, 62, 58, 71, 68, 82, 78].map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-gold-accent/40 rounded-t-lg" style={{ height: `${v}%` }} />
                <span className="text-[10px] text-brand-on-surface-variant">W{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
