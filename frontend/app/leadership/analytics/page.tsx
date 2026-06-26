'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import { api } from '@/lib/api';

interface WorkSession {
  session_type: string;
  duration_minutes: number | null;
}

const TYPE_LABELS: Record<string, string> = {
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

export default function OrganizationAnalyticsPage() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [qualityAvg, setQualityAvg] = useState<string>('—');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<WorkSession[]>('/sessions?limit=200'),
      api.get<{ composite_score: number }[]>('/quality/scores'),
    ])
      .then(([sessionList, scores]) => {
        setSessions(sessionList);
        if (scores.length > 0) {
          const avg = scores.reduce((sum, s) => sum + Number(s.composite_score), 0) / scores.length;
          setQualityAvg(avg.toFixed(1));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  const totalHours = sessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0) / 60;
  const byType = sessions.reduce<Record<string, { count: number; minutes: number }>>((acc, s) => {
    const key = s.session_type;
    if (!acc[key]) acc[key] = { count: 0, minutes: 0 };
    acc[key].count += 1;
    acc[key].minutes += s.duration_minutes ?? 0;
    return acc;
  }, {});

  const charts = [
    { title: 'Country Analysis', metric: sessions.length > 0 ? `${sessions.length} sessions` : '—', trend: '' },
    { title: 'Partner Analysis', metric: '—', trend: '' },
    { title: 'Session Analysis', metric: totalHours > 0 ? `${Math.round(totalHours)} hours` : '—', trend: '' },
    { title: 'Quality Analysis', metric: qualityAvg !== '—' ? `${qualityAvg} avg score` : '—', trend: '' },
    { title: 'Revenue Analysis', metric: '—', trend: '' },
  ];

  return (
    <div>
      <PageHeader
        title="Organization Analytics"
        description="Cross-dimensional analysis — country, partner, session, quality, and revenue with interactive charts."
      />
      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading analytics...</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {charts.map((c) => (
              <div key={c.title} className="glass-panel p-5">
                <h3 className="text-sm font-bold text-white mb-3">{c.title}</h3>
                <p className="text-2xl font-black text-emerald-accent">{c.metric}</p>
                {c.trend ? <p className="text-xs text-success mt-1">{c.trend} vs last period</p> : null}
              </div>
            ))}
          </div>
          <div className="glass-panel p-6">
            <h2 className="font-bold text-white mb-4">Session Type Breakdown</h2>
            {Object.keys(byType).length === 0 ? (
              <p className="text-sm text-brand-on-surface-variant">No session data yet.</p>
            ) : (
              <div className="grid sm:grid-cols-3 gap-4">
                {Object.entries(byType).map(([type, data]) => {
                  const pct = sessions.length > 0 ? Math.round((data.count / sessions.length) * 100) : 0;
                  const hours = Math.round(data.minutes / 60);
                  return (
                    <div key={type} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-sm text-white font-bold">{TYPE_LABELS[type] ?? type}</p>
                      <p className="text-2xl font-black text-gold-accent mt-1">{pct}%</p>
                      <p className="text-xs text-brand-on-surface-variant">{hours} hours</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
