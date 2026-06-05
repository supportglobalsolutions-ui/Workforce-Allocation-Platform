'use client';

import PageHeader from '@/components/platform/PageHeader';
import { Plus } from 'lucide-react';

const questions = [
  { id: 'Q-001', text: 'What is the correct procedure for starting an RDP session?', category: 'Operations', difficulty: 'Beginner' },
  { id: 'Q-002', text: 'How should data labelling inconsistencies be reported?', category: 'Quality', difficulty: 'Intermediate' },
  { id: 'Q-003', text: 'Which security protocols apply to client data handling?', category: 'Compliance', difficulty: 'Advanced' },
];

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
            <p className="text-xs text-brand-on-surface-variant mt-1">{tab === 'Question Bank' ? `${questions.length} questions` : 'Manage →'}</p>
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {questions.map((q) => (
          <div key={q.id} className="glass-panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-mono text-brand-on-surface-variant">{q.id}</span>
              <p className="text-sm text-white font-medium mt-1">{q.text}</p>
              <p className="text-xs text-brand-on-surface-variant">{q.category} · {q.difficulty}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary text-xs py-1.5">Edit</button>
              <button className="btn-secondary text-xs py-1.5">Assign</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
