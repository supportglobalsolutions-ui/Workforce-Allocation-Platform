'use client';

import PageHeader from '@/components/platform/PageHeader';

const charts = [
  { title: 'Country Analysis', metric: '847 sessions', trend: '+12%' },
  { title: 'Partner Analysis', metric: '£102.5K revenue', trend: '+8%' },
  { title: 'Session Analysis', metric: '3,240 hours', trend: '+15%' },
  { title: 'Quality Analysis', metric: '94.2 avg score', trend: '+2.1' },
  { title: 'Revenue Analysis', metric: '£284.7K gross', trend: '+11%' },
];

export default function OrganizationAnalyticsPage() {
  return (
    <div>
      <PageHeader
        title="Organization Analytics"
        description="Cross-dimensional analysis — country, partner, session, quality, and revenue with interactive charts."
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {charts.map((c) => (
          <div key={c.title} className="glass-panel p-5">
            <h3 className="text-sm font-bold text-white mb-3">{c.title}</h3>
            <p className="text-2xl font-black text-emerald-accent">{c.metric}</p>
            <p className="text-xs text-success mt-1">{c.trend} vs last period</p>
            <div className="mt-4 h-16 flex items-end gap-1">
              {[40, 55, 45, 70, 60, 80, 75].map((v, i) => (
                <div key={i} className="flex-1 bg-emerald-accent/30 rounded-t" style={{ height: `${v}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="glass-panel p-6">
        <h2 className="font-bold text-white mb-4">Session Type Breakdown</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { type: 'GS RDP', pct: 62, hours: 2010 },
            { type: 'Partner Multilog', pct: 24, hours: 778 },
            { type: 'Third Party', pct: 14, hours: 452 },
          ].map((s) => (
            <div key={s.type} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-sm text-white font-bold">{s.type}</p>
              <p className="text-2xl font-black text-gold-accent mt-1">{s.pct}%</p>
              <p className="text-xs text-brand-on-surface-variant">{s.hours} hours</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
