'use client';

import { useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';

export default function ExternalSessionPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="External Session Logging"
        description="Log partner multilog or third-party platform sessions (Outlier, Handshake, Prolific)."
      />
      {submitted ? (
        <div className="glass-panel p-6 border-success/30 text-success">
          Session logged successfully. It will appear in your session history and count toward payroll once approved.
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
          className="glass-panel p-6 space-y-4"
        >
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Session Type</label>
            <select className="input-field" required>
              <option value="">Select type...</option>
              <option value="partner">Partner Multilog Client</option>
              <option value="handshake">Handshake</option>
              <option value="outlier">Outlier</option>
              <option value="prolific">Prolific</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Partner Channel</label>
            <select className="input-field">
              <option value="">None (direct platform)</option>
              <option value="alpha">Partner Alpha</option>
              <option value="beta">Partner Beta</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Platform / Client Name</label>
            <input type="text" placeholder="e.g. Prolific, Multilog Client X" className="input-field" required />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Reference ID</label>
            <input type="text" placeholder="Task or batch reference" className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Duration (hours)</label>
              <input type="number" step="0.25" min="0.25" placeholder="3.5" className="input-field" required />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Earnings (optional)</label>
              <input type="number" step="0.01" placeholder="0.00" className="input-field" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Notes</label>
            <textarea rows={3} placeholder="Additional context..." className="input-field resize-none" />
          </div>
          <button type="submit" className="btn-primary w-full">Submit Session Log</button>
        </form>
      )}
    </div>
  );
}
