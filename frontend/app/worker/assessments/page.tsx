'use client';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { assessments } from '@/lib/mock-data';

export default function AssessmentCenterPage() {
  const assigned = assessments.filter((a) => a.status === 'assigned');
  const completed = assessments.filter((a) => a.status === 'completed');

  return (
    <div>
      <PageHeader
        title="Assessment Center"
        description="MCQ assessments contribute 50% of your composite quality score."
      />
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-sm font-bold text-white mb-4">Assigned Tests ({assigned.length})</h2>
          <div className="space-y-3">
            {assigned.map((a) => (
              <div key={a.id} className="glass-panel p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">{a.title}</p>
                  <p className="text-xs text-brand-on-surface-variant">{a.category} · {a.difficulty}</p>
                </div>
                <button className="btn-primary text-xs">Start</button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-bold text-white mb-4">Completed Tests</h2>
          <div className="space-y-3">
            {completed.map((a) => (
              <div key={a.id} className="glass-panel p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">{a.title}</p>
                  <p className="text-xs text-brand-on-surface-variant">{a.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-emerald-accent">{a.score}%</p>
                  <StatusBadge status="completed" label="Passed" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="glass-panel p-6">
        <h2 className="text-sm font-bold text-white mb-4">Certificates</h2>
        <p className="text-sm text-brand-on-surface-variant">Complete all compliance assessments to earn your platform certification badge.</p>
        <div className="mt-4 p-4 rounded-xl border border-gold-accent/20 bg-gold-accent/5 inline-block">
          <p className="text-gold-accent font-bold text-sm">🏅 Platform Safety — Certified</p>
        </div>
      </div>
    </div>
  );
}
