'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, BarChart3, CheckCircle, ChevronRight,
  FileQuestion, Plus, Settings, Trash2, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AssessmentSet {
  id: string;
  title: string;
  category: string;
  passing_score_pct: number;
  is_active: boolean;
  created_by: string;
  question_count: number;
  result_count: number;
}

interface McqQuestion {
  id: string;
  assessment_set_id: string;
  prompt: string;
  options: { key: string; text: string }[];
  correct_option_key: string;
  sort_order: number;
}

interface McqResult {
  id: string;
  worker_id: string;
  assessment_set_id: string;
  score_pct: number;
  passed: boolean;
  completed_at: string;
  worker_display_name: string;
  worker_country: string;
}

type AssessmentTab = 'questions' | 'results' | 'settings';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-gold-accent mb-3">{children}</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">{label}</label>
      {children}
    </div>
  );
}

// ── Add / Edit Question Modal ─────────────────────────────────────────────────

interface QuestionModalProps {
  assessmentId: string;
  existing?: McqQuestion;
  nextOrder: number;
  onSaved: (q: McqQuestion) => void;
  onClose: () => void;
}

function QuestionModal({ assessmentId, existing, nextOrder, onSaved, onClose }: QuestionModalProps) {
  const [prompt, setPrompt]   = useState(existing?.prompt ?? '');
  const [options, setOptions] = useState<{ key: string; text: string }[]>(
    existing?.options ?? OPTION_KEYS.map((k) => ({ key: k, text: '' })),
  );
  const [correct, setCorrect] = useState(existing?.correct_option_key ?? 'A');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  function setOptionText(key: string, text: string) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, text } : o)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (options.some((o) => !o.text.trim())) { setError('All four options must have text.'); return; }
    setSaving(true); setError('');
    try {
      if (existing) {
        const updated = await api.patch<McqQuestion>(`/assessments/questions/${existing.id}`, {
          prompt, options, correct_option_key: correct,
        });
        onSaved(updated);
      } else {
        const created = await api.post<McqQuestion>(`/assessments/${assessmentId}/questions`, {
          assessment_set_id: assessmentId,
          prompt, options, correct_option_key: correct,
          sort_order: nextOrder,
        });
        onSaved(created);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save question.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-white">{existing ? 'Edit Question' : 'New Question'}</h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <Field label="Question Prompt">
            <textarea
              required
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type the question here…"
              className="input-field resize-none"
            />
          </Field>

          <div>
            <SectionTitle>Answer Options</SectionTitle>
            <div className="space-y-2">
              {options.map((opt) => (
                <div key={opt.key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrect(opt.key)}
                    className={`w-7 h-7 shrink-0 rounded-full border-2 text-[10px] font-bold transition-colors ${
                      correct === opt.key
                        ? 'border-emerald-accent bg-emerald-accent/20 text-emerald-400'
                        : 'border-white/20 text-theme-muted hover:border-white/40'
                    }`}
                    title={`Mark ${opt.key} as correct`}
                  >
                    {opt.key}
                  </button>
                  <input
                    required
                    value={opt.text}
                    onChange={(e) => setOptionText(opt.key, e.target.value)}
                    placeholder={`Option ${opt.key}…`}
                    className="input-field flex-1"
                  />
                  {correct === opt.key && (
                    <CheckCircle size={14} className="text-emerald-accent shrink-0" />
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-theme-muted mt-2">Click a letter to mark the correct answer.</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" className="text-emerald-accent" /> : <CheckCircle size={13} />}
              {existing ? 'Save Changes' : 'Add Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Create / Edit Assessment Modal ────────────────────────────────────────────

interface AssessmentFormModalProps {
  existing?: AssessmentSet;
  onSaved: (s: AssessmentSet) => void;
  onClose: () => void;
}

function AssessmentFormModal({ existing, onSaved, onClose }: AssessmentFormModalProps) {
  const [title,    setTitle]    = useState(existing?.title ?? '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [passing,  setPassing]  = useState(String(existing?.passing_score_pct ?? 70));
  const [active,   setActive]   = useState(existing?.is_active ?? true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    const body = { title, category, passing_score_pct: Number(passing), is_active: active };
    try {
      if (existing) {
        const updated = await api.patch<AssessmentSet>(`/assessments/${existing.id}`, body);
        onSaved(updated);
      } else {
        const created = await api.post<AssessmentSet>('/assessments', body);
        onSaved(created);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save assessment.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-white">{existing ? 'Edit Assessment' : 'New Assessment'}</h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Title">
            <input required value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Customer Service Basics" className="input-field" />
          </Field>
          <Field label="Category">
            <input required value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Onboarding, Compliance, Sales" className="input-field" />
          </Field>
          <Field label="Passing Score (%)">
            <input type="number" required min={1} max={100} value={passing}
              onChange={(e) => setPassing(e.target.value)} className="input-field" />
          </Field>
          <Field label="Status">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActive((v) => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${active ? 'bg-emerald-accent/40' : 'bg-white/10'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${active ? 'right-0.5 bg-emerald-accent' : 'left-0.5 bg-white/30'}`} />
              </button>
              <span className={`text-sm ${active ? 'text-emerald-400' : 'text-theme-muted'}`}>
                {active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </Field>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" className="text-emerald-accent" /> : <CheckCircle size={13} />}
              {existing ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Assessment Detail Modal ────────────────────────────────────────────────────

interface AssessmentDetailModalProps {
  set: AssessmentSet;
  onClose: () => void;
  onUpdated: (s: AssessmentSet) => void;
  onDeleted: (id: string) => void;
}

function AssessmentDetailModal({ set, onClose, onUpdated, onDeleted }: AssessmentDetailModalProps) {
  const [tab, setTab] = useState<AssessmentTab>('questions');

  // Questions
  const [questions, setQuestions] = useState<McqQuestion[]>([]);
  const [qLoading,  setQLoading]  = useState(false);
  const [qError,    setQError]    = useState('');
  const [showQForm, setShowQForm] = useState(false);
  const [editQ,     setEditQ]     = useState<McqQuestion | undefined>();
  const [deletingQ, setDeletingQ] = useState<string | null>(null);

  // Results
  const [results,  setResults]  = useState<McqResult[]>([]);
  const [rLoading, setRLoading] = useState(false);
  const [rError,   setRError]   = useState('');

  // Delete assessment
  const [deleting,  setDeleting]  = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit assessment
  const [showEdit, setShowEdit] = useState(false);
  const [localSet, setLocalSet] = useState<AssessmentSet>(set);

  const loadQuestions = useCallback(async () => {
    setQLoading(true); setQError('');
    try { setQuestions(await api.get<McqQuestion[]>(`/assessments/${set.id}/questions`)); }
    catch (e: unknown) { setQError(e instanceof Error ? e.message : 'Failed to load questions.'); }
    finally { setQLoading(false); }
  }, [set.id]);

  const loadResults = useCallback(async () => {
    setRLoading(true); setRError('');
    try { setResults(await api.get<McqResult[]>(`/assessments/${set.id}/results`)); }
    catch (e: unknown) { setRError(e instanceof Error ? e.message : 'Failed to load results.'); }
    finally { setRLoading(false); }
  }, [set.id]);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);
  useEffect(() => { if (tab === 'results') loadResults(); }, [tab, loadResults]);

  async function handleDeleteQuestion(qid: string) {
    setDeletingQ(qid);
    try {
      await api.delete(`/assessments/questions/${qid}`);
      setQuestions((prev) => prev.filter((q) => q.id !== qid));
    } catch { /* ignore */ }
    finally { setDeletingQ(null); }
  }

  async function handleDeleteAssessment() {
    setDeleting(true); setDeleteErr('');
    try {
      await api.delete(`/assessments/${set.id}`);
      onDeleted(set.id);
    } catch (e: unknown) {
      setDeleteErr(e instanceof Error ? e.message : 'Failed to delete.');
      setDeleting(false);
    }
  }

  const TABS: { key: AssessmentTab; label: string; icon: React.ReactNode }[] = [
    { key: 'questions', label: 'Questions', icon: <FileQuestion size={13} /> },
    { key: 'results',   label: 'Results',   icon: <BarChart3 size={13} /> },
    { key: 'settings',  label: 'Settings',  icon: <Settings size={13} /> },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
            <div className="min-w-0 pr-4">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  localSet.is_active
                    ? 'bg-emerald-accent/20 text-emerald-400 border border-emerald-accent/30'
                    : 'bg-white/10 text-theme-muted border border-white/10'
                }`}>
                  {localSet.is_active ? 'Active' : 'Inactive'}
                </span>
                <span className="text-[10px] text-theme-muted">{localSet.category}</span>
              </div>
              <h2 className="text-base font-bold text-white truncate">{localSet.title}</h2>
              <p className="text-xs text-theme-muted mt-0.5">
                {questions.length} question{questions.length !== 1 ? 's' : ''}
                <span className="mx-1.5 opacity-40">·</span>
                Pass at {Number(localSet.passing_score_pct).toFixed(0)}%
                <span className="mx-1.5 opacity-40">·</span>
                {results.length || localSet.result_count} attempt{(results.length || localSet.result_count) !== 1 ? 's' : ''}
              </p>
            </div>
            <button type="button" onClick={onClose}
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06] px-5 shrink-0">
            {TABS.map(({ key, label, icon }) => (
              <button key={key} type="button" onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                  tab === key ? 'text-emerald-400 border-emerald-400' : 'text-theme-muted border-transparent hover:text-white'
                }`}>
                {icon} {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">

            {/* ── Questions ── */}
            {tab === 'questions' && (
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-theme-muted">{questions.length} question{questions.length !== 1 ? 's' : ''}</p>
                  <button type="button" onClick={() => { setEditQ(undefined); setShowQForm(true); }}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                    <Plus size={13} /> Add Question
                  </button>
                </div>

                {qLoading ? (
                  <div className="flex justify-center py-8"><SpinningDots size="md" className="text-emerald-accent" /></div>
                ) : qError ? (
                  <p className="text-danger text-sm">{qError}</p>
                ) : questions.length === 0 ? (
                  <div className="text-center py-10 text-theme-muted text-sm">
                    No questions yet. Add your first MCQ above.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {questions.map((q, idx) => (
                      <div key={q.id} className="glass-panel rounded-xl p-4 border border-white/[0.06]">
                        <div className="flex items-start gap-3">
                          <span className="text-[10px] font-bold text-theme-muted mt-0.5 w-5 shrink-0">Q{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium">{q.prompt}</p>
                            <div className="mt-2 grid grid-cols-2 gap-1">
                              {q.options.map((opt) => (
                                <div key={opt.key}
                                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${
                                    opt.key === q.correct_option_key
                                      ? 'bg-emerald-accent/10 text-emerald-400 border border-emerald-accent/20'
                                      : 'text-theme-muted'
                                  }`}>
                                  <span className="font-bold">{opt.key}.</span>
                                  <span className="truncate">{opt.text}</span>
                                  {opt.key === q.correct_option_key && <CheckCircle size={11} className="shrink-0" />}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => { setEditQ(q); setShowQForm(true); }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"
                              title="Edit question">
                              <Settings size={12} />
                            </button>
                            <button type="button" onClick={() => handleDeleteQuestion(q.id)}
                              disabled={deletingQ === q.id}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-theme-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                              title="Delete question">
                              {deletingQ === q.id ? <SpinningDots size="sm" /> : <Trash2 size={12} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Results ── */}
            {tab === 'results' && (
              <div className="p-5">
                {rLoading ? (
                  <div className="flex justify-center py-8"><SpinningDots size="md" className="text-emerald-accent" /></div>
                ) : rError ? (
                  <p className="text-danger text-sm">{rError}</p>
                ) : results.length === 0 ? (
                  <div className="text-center py-10 text-theme-muted text-sm">No results yet — no worker has taken this assessment.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left pb-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Worker</th>
                        <th className="text-right pb-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Score</th>
                        <th className="text-center pb-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Result</th>
                        <th className="text-right pb-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
                          <td className="py-3">
                            <p className="text-white font-medium">{r.worker_display_name}</p>
                            <p className="text-xs text-theme-muted">{r.worker_country}</p>
                          </td>
                          <td className="py-3 text-right text-white font-bold">{Number(r.score_pct).toFixed(1)}%</td>
                          <td className="py-3 text-center">
                            {r.passed
                              ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-accent/10 px-2 py-0.5 rounded-full border border-emerald-accent/20">PASS</span>
                              : <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">FAIL</span>
                            }
                          </td>
                          <td className="py-3 text-right text-xs text-theme-muted">
                            {new Date(r.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── Settings ── */}
            {tab === 'settings' && (
              <div className="p-5 space-y-6">
                {/* Assessment config */}
                <div>
                  <SectionTitle>Assessment Config</SectionTitle>
                  <div className="space-y-3 text-sm">
                    {[
                      { label: 'Title',        value: localSet.title },
                      { label: 'Category',     value: localSet.category },
                      { label: 'Passing Score',value: `${Number(localSet.passing_score_pct).toFixed(0)}%` },
                      { label: 'Status',       value: localSet.is_active ? 'Active' : 'Inactive' },
                      { label: 'Questions',    value: questions.length },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                        <span className="text-theme-muted text-xs">{label}</span>
                        <span className="text-white font-medium text-xs">{value}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setShowEdit(true)}
                    className="mt-4 btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                    <Settings size={12} /> Edit Assessment
                  </button>
                </div>

                {/* Leaderboard contribution */}
                <div>
                  <SectionTitle>Leaderboard Contribution</SectionTitle>
                  <div className="glass-panel rounded-xl p-4 border border-white/[0.06] space-y-3">
                    <div className="flex items-start gap-2">
                      <BarChart3 size={14} className="text-gold-accent shrink-0 mt-0.5" />
                      <p className="text-xs text-theme-muted">
                        Passing this assessment contributes to a worker's <span className="text-white">MCQ component</span> score,
                        which feeds into their composite leaderboard score. Workers who pass more assessments rank higher.
                      </p>
                    </div>
                    {[
                      { label: 'MCQ Component weight',      value: '20% of composite score' },
                      { label: 'Passing threshold',         value: `${Number(localSet.passing_score_pct).toFixed(0)}%` },
                      { label: 'Score when passed',         value: 'Full score_pct credited' },
                      { label: 'Score when failed',         value: 'Partial credit (score_pct × 0.5)' },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                        <span className="text-xs text-theme-muted">{label}</span>
                        <span className="text-xs text-emerald-accent font-mono">{value}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-theme-muted/60 mt-2">
                    Additional leaderboard point multipliers can be configured in Settings → Leaderboard.
                  </p>
                </div>

                {/* Danger zone */}
                <div>
                  <SectionTitle>Danger Zone</SectionTitle>
                  {deleteErr && (
                    <p className="text-xs text-red-400 mb-2">{deleteErr}</p>
                  )}
                  {confirmDelete ? (
                    <div className="glass-panel rounded-xl p-4 border border-red-500/30 bg-red-500/5">
                      <p className="text-xs text-red-300 mb-3">This will permanently delete the assessment and all its questions. Results will be preserved but unlinked. This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={handleDeleteAssessment} disabled={deleting}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-colors disabled:opacity-60">
                          {deleting ? <SpinningDots size="sm" /> : <Trash2 size={12} />}
                          Confirm Delete
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(false)}
                          className="btn-secondary text-xs py-1.5 px-3">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-colors">
                      <Trash2 size={12} /> Delete Assessment
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Question add/edit modal (z-index above detail modal) */}
      {showQForm && (
        <QuestionModal
          assessmentId={set.id}
          existing={editQ}
          nextOrder={questions.length}
          onSaved={(q) => {
            setQuestions((prev) => {
              const idx = prev.findIndex((x) => x.id === q.id);
              return idx >= 0 ? prev.map((x) => x.id === q.id ? q : x) : [...prev, q];
            });
            setShowQForm(false);
          }}
          onClose={() => { setShowQForm(false); setEditQ(undefined); }}
        />
      )}

      {/* Edit assessment settings modal */}
      {showEdit && (
        <AssessmentFormModal
          existing={localSet as unknown as AssessmentSet}
          onSaved={(updated) => {
            const merged = { ...localSet, ...updated };
            setLocalSet(merged);
            onUpdated(merged);
            setShowEdit(false);
          }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AssessmentsPage() {
  const [sets,    setSets]    = useState<AssessmentSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected,   setSelected]   = useState<AssessmentSet | null>(null);

  async function load() {
    setLoading(true); setError('');
    try { setSets(await api.get<AssessmentSet[]>('/assessments')); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load assessments.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const activeCount   = sets.filter((s) => s.is_active).length;
  const totalQ        = sets.reduce((a, s) => a + s.question_count, 0);
  const totalAttempts = sets.reduce((a, s) => a + s.result_count, 0);

  return (
    <div>
      <PageHeader
        title="Assessment Builder"
        description="Build MCQ exams, manage questions, and track worker results."
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
            <Plus size={15} /> New Assessment
          </button>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Assessments',    value: sets.length,     sub: `${activeCount} active` },
          { label: 'Total Questions',value: totalQ,          sub: 'across all exams' },
          { label: 'Total Attempts', value: totalAttempts,   sub: 'by workers' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="glass-panel p-4">
            <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
            <p className="text-xs font-semibold text-white mt-0.5">{label}</p>
            <p className="text-[10px] text-theme-muted mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Assessment list */}
      {loading ? (
        <div className="flex justify-center py-20"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      ) : sets.length === 0 ? (
        <div className="glass-panel p-12 text-center text-theme-muted text-sm">
          No assessments yet. Create your first exam to get started.
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Assessment</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden sm:table-cell">Category</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Questions</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">Attempts</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">Pass %</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => (
                <tr key={s.id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => setSelected(s)}>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{s.title}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-theme-muted hidden sm:table-cell">{s.category}</td>
                  <td className="px-4 py-3 text-center text-white font-bold tabular-nums">{s.question_count}</td>
                  <td className="px-4 py-3 text-center text-white tabular-nums hidden md:table-cell">{s.result_count}</td>
                  <td className="px-4 py-3 text-center text-theme-muted text-xs hidden md:table-cell">
                    {Number(s.passing_score_pct).toFixed(0)}% to pass
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      s.is_active
                        ? 'bg-emerald-accent/20 text-emerald-400 border border-emerald-accent/30'
                        : 'bg-white/10 text-theme-muted border border-white/10'
                    }`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={14} className="text-theme-muted" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <AssessmentFormModal
          onSaved={(created) => {
            setSets((prev) => [...prev, { ...created, question_count: 0, result_count: 0 }]);
            setShowCreate(false);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Detail modal */}
      {selected && (
        <AssessmentDetailModal
          set={selected}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setSets((prev) => prev.map((s) => s.id === updated.id ? { ...s, ...updated } : s));
            setSelected((prev) => prev ? { ...prev, ...updated } : prev);
          }}
          onDeleted={(id) => {
            setSets((prev) => prev.filter((s) => s.id !== id));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
