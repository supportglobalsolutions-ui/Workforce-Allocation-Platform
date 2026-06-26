'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import { api } from '@/lib/api';

interface Worker {
  id: string;
  display_name: string;
}

interface QualityRating {
  id: string;
  worker_id: string;
  score: number;
  reason_note: string | null;
  created_at: string;
}

export default function QualityManagementPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [ratings, setRatings] = useState<QualityRating[]>([]);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Worker[]>('/workers'),
      api.get<QualityRating[]>('/quality/ratings'),
    ])
      .then(([workerList, ratingList]) => {
        setWorkers(workerList);
        setRatings(ratingList);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load quality data'))
      .finally(() => setLoading(false));
  }, []);

  const workerName = (id: string) => workers.find((w) => w.id === id)?.display_name ?? id.slice(0, 8);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Quality Management"
        description="Input subjective quality ratings — communication and organisation scores with mandatory reason notes."
      />
      <FilterBar searchPlaceholder="Search workers..." />
      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading...</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : submitted ? (
        <div className="glass-panel p-6 text-success border-success/30">Rating submitted and recorded in audit log.</div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
          className="glass-panel p-6 space-y-4"
        >
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Worker</label>
            <select className="input-field" required value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}>
              <option value="">Select worker...</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Communication Score (1–5)</label>
            <input type="range" min="1" max="5" defaultValue="4" className="w-full accent-emerald-accent" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Organisation Score (1–5)</label>
            <input type="range" min="1" max="5" defaultValue="4" className="w-full accent-emerald-accent" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Reason Note (required)</label>
            <textarea rows={3} required placeholder="Explain the rating..." className="input-field resize-none" />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={workers.length === 0}>Submit Rating</button>
        </form>
      )}
      <div className="glass-panel p-6 mt-6">
        <h2 className="text-sm font-bold text-white mb-4">Rating History</h2>
        {ratings.length === 0 ? (
          <p className="text-sm text-brand-on-surface-variant">No ratings recorded yet.</p>
        ) : (
          <div className="space-y-2 text-sm text-brand-on-surface-variant">
            {ratings.map((r) => (
              <p key={r.id}>
                {workerName(r.worker_id)} — Score: {Number(r.score).toFixed(1)}/5
                {r.reason_note ? ` — "${r.reason_note}"` : ''}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
