'use client';

import { useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import { workers } from '@/lib/mock-data';

export default function QualityManagementPage() {
  const [selectedWorker, setSelectedWorker] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Quality Management"
        description="Input subjective quality ratings — communication and organisation scores with mandatory reason notes."
      />
      <FilterBar searchPlaceholder="Search workers..." />
      {submitted ? (
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
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
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
          <button type="submit" className="btn-primary w-full">Submit Rating</button>
        </form>
      )}
      <div className="glass-panel p-6 mt-6">
        <h2 className="text-sm font-bold text-white mb-4">Rating History</h2>
        <div className="space-y-2 text-sm text-brand-on-surface-variant">
          <p>James Okonkwo — Communication: 4/5 — &quot;Responsive to admin messages&quot;</p>
          <p>Sarah Mwangi — Organisation: 5/5 — &quot;Consistently on-time for shifts&quot;</p>
        </div>
      </div>
    </div>
  );
}
