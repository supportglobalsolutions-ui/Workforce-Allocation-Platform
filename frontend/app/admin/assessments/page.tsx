'use client';

import PageHeader from '@/components/platform/PageHeader';
import { Plus } from 'lucide-react';

export default function AssessmentBuilderPage() {
  return (
    <div>
      <PageHeader
        title="Assessment Builder"
        description="Manage MCQ question bank, categories, difficulty levels, assignments, and results."
        actions={<button className="btn-primary flex items-center gap-2"><Plus size={16} />Add Question</button>}
      />
      <div className="grid lg:grid-cols-4 gap-4 mb-8">
        {['Question Bank', 'Categories', 'Assignments', 'Results'].map((tab) => (
          <button key={tab} className="glass-panel p-4 text-left hover:border-emerald-accent/20 transition-all">
            <p className="font-bold text-white text-sm">{tab}</p>
            <p className="text-xs text-brand-on-surface-variant mt-1">{tab === 'Question Bank' ? '0 questions' : 'Manage →'}</p>
          </button>
        ))}
      </div>
      <div className="glass-panel p-8 text-center text-brand-on-surface-variant text-sm">
        No assessment questions yet. Add questions to build your question bank.
      </div>
    </div>
  );
}
