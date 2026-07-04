'use client';

import { useCallback, useEffect, useState } from 'react';

import FilterBar from '@/components/platform/FilterBar';
import PageHeader from '@/components/platform/PageHeader';
import { api } from '@/lib/api';

interface LeaderboardEntry {
  id: string;
  worker_id: string;
  worker_display_name: string;
  worker_country: string;
  composite_score: number;
  global_rank: number | null;
  country_rank: number | null;
  session_streak_days: number | null;
  calculated_at: string;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');

  const load = useCallback(async (country?: string) => {
    setLoading(true);
    setError(null);
    try {
      const path = country
        ? `/leaderboard?country=${encodeURIComponent(country)}&limit=50`
        : '/leaderboard?limit=50';
      const data = await api.get<LeaderboardEntry[]>(path);
      setEntries(data);
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFilterChange = (label: string, value: string) => {
    if (label === 'Country' && value) load(value);
    if (label === 'Scope' && value === 'Global') load();
  };

  return (
    <div>
      <PageHeader
        title="Global Leaderboard"
        description="Rankings powered by composite quality scores — MCQ (50%) + subjective indicators (50%). Refreshes every 5 minutes."
        actions={
          <span className="text-xs font-mono text-emerald-accent">
            {updatedAt ? `Updated ${updatedAt}` : '...'}
          </span>
        }
      />
      <FilterBar
        filters={[
          { label: 'Scope', options: ['Global', 'Country'] },
          { label: 'Country', options: ['Kenya', 'Nigeria', 'Uganda', 'Ghana'] },
        ]}
        onFilterChange={handleFilterChange}
      />

      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading leaderboard...</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : entries.length === 0 ? (
        <p className="text-theme-muted text-sm mt-4">No leaderboard data available yet.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => {
            const rank = entry.global_rank ?? i + 1;
            return (
              <div
                key={entry.id}
                className={`glass-panel p-4 flex items-center gap-4 transition-all ${
                  rank <= 3 ? 'border-gold-accent/20' : ''
                }`}
              >
                <span
                  className={`text-2xl font-black font-mono w-10 ${
                    rank === 1
                      ? 'text-gold-accent text-glow-gold'
                      : rank <= 3
                      ? 'text-emerald-accent'
                      : 'text-brand-on-surface-variant'
                  }`}
                >
                  #{rank}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">{entry.worker_display_name}</p>
                  <p className="text-xs text-brand-on-surface-variant">
                    {entry.worker_country}
                    {entry.session_streak_days != null
                      ? ` · ${entry.session_streak_days} day streak`
                      : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-emerald-accent">
                    {Number(entry.composite_score).toFixed(1)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
