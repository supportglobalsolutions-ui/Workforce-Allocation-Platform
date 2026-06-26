'use client';

import PageHeader from '@/components/platform/PageHeader';

export default function AssessmentCenterPage() {
  return (
    <div>
      <PageHeader
        title="Assessment Center"
        description="MCQ assessments contribute 50% of your composite quality score."
      />
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-sm font-bold text-white mb-4">Assigned Tests (0)</h2>
          <p className="text-sm text-brand-on-surface-variant">No assessments assigned yet.</p>
        </div>
        <div>
          <h2 className="text-sm font-bold text-white mb-4">Completed Tests</h2>
          <p className="text-sm text-brand-on-surface-variant">No completed assessments yet.</p>
        </div>
      </div>
      <div className="glass-panel p-6">
        <h2 className="text-sm font-bold text-white mb-4">Certificates</h2>
        <p className="text-sm text-brand-on-surface-variant">Complete all compliance assessments to earn your platform certification badge.</p>
      </div>
    </div>
  );
}
