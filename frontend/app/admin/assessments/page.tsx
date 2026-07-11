'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, BarChart3, CheckCircle, ChevronRight,
  Clock, Eye, FileQuestion, Film, Image as ImageIcon, Plus,
  Settings, Timer, Trash2, Upload, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import {
  fetchTaskAssessments, fetchTaskResults, uploadTaskMedia, deleteTaskMedia,
  type TaskAssessment, type TaskResult, type TaskMedia, type UploadProgress,
} from '@/lib/task-assessments';

// ── Shared helpers ─────────────────────────────────────────────────────────────

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

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-emerald-accent/40' : 'bg-white/10'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${value ? 'right-0.5 bg-emerald-accent' : 'left-0.5 bg-white/30'}`} />
    </button>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
      active
        ? 'bg-emerald-accent/20 text-emerald-400 border border-emerald-accent/30'
        : 'bg-white/10 text-theme-muted border border-white/10'
    }`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function ModalShell({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// MCQ section
// ════════════════════════════════════════════════════════════════════════════════

interface AssessmentSet {
  id: string; title: string; category: string; passing_score_pct: number;
  is_active: boolean; created_by: string; question_count: number; result_count: number;
}
interface McqQuestion {
  id: string; assessment_set_id: string; prompt: string;
  options: { key: string; text: string }[]; correct_option_key: string; sort_order: number;
}
interface McqResult {
  id: string; worker_id: string; assessment_set_id: string; score_pct: number;
  passed: boolean; completed_at: string; worker_display_name: string; worker_country: string;
}
type McqDetailTab = 'questions' | 'results' | 'settings';
const OPTION_KEYS = ['A', 'B', 'C', 'D'];

// ── Question Modal ─────────────────────────────────────────────────────────────

function QuestionModal({
  assessmentId, existing, nextOrder, onSaved, onClose,
}: { assessmentId: string; existing?: McqQuestion; nextOrder: number; onSaved: (q: McqQuestion) => void; onClose: () => void }) {
  const [prompt, setPrompt]   = useState(existing?.prompt ?? '');
  const [options, setOptions] = useState(existing?.options ?? OPTION_KEYS.map((k) => ({ key: k, text: '' })));
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
        onSaved(await api.patch<McqQuestion>(`/assessments/questions/${existing.id}`, { prompt, options, correct_option_key: correct }));
      } else {
        onSaved(await api.post<McqQuestion>(`/assessments/${assessmentId}/questions`, {
          assessment_set_id: assessmentId, prompt, options, correct_option_key: correct, sort_order: nextOrder,
        }));
      }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to save.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-white">{existing ? 'Edit Question' : 'New Question'}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <Field label="Question Prompt">
            <textarea required rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type the question here…" className="input-field resize-none" />
          </Field>
          <div>
            <SectionTitle>Answer Options</SectionTitle>
            <div className="space-y-2">
              {options.map((opt) => (
                <div key={opt.key} className="flex items-center gap-2">
                  <button type="button" onClick={() => setCorrect(opt.key)}
                    className={`w-7 h-7 shrink-0 rounded-full border-2 text-[10px] font-bold transition-colors ${
                      correct === opt.key ? 'border-emerald-accent bg-emerald-accent/20 text-emerald-400' : 'border-white/20 text-theme-muted hover:border-white/40'
                    }`}>
                    {opt.key}
                  </button>
                  <input required value={opt.text} onChange={(e) => setOptionText(opt.key, e.target.value)}
                    placeholder={`Option ${opt.key}…`} className="input-field flex-1" />
                  {correct === opt.key && <CheckCircle size={14} className="text-emerald-accent shrink-0" />}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-theme-muted mt-2">Click the letter to mark the correct answer.</p>
          </div>
          {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs"><AlertCircle size={13} /> {error}</div>}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" className="text-emerald-accent" /> : <CheckCircle size={13} />}
              {existing ? 'Save' : 'Add Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── MCQ Assessment Form Modal ──────────────────────────────────────────────────

function McqFormModal({
  existing, onSaved, onClose,
}: { existing?: AssessmentSet; onSaved: (s: AssessmentSet) => void; onClose: () => void }) {
  const [title,    setTitle]    = useState(existing?.title ?? '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [passing,  setPassing]  = useState(String(existing?.passing_score_pct ?? 70));
  const [active,   setActive]   = useState(existing?.is_active ?? true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    const body = { title, category, passing_score_pct: Number(passing), is_active: active };
    try {
      if (existing) { onSaved(await api.patch<AssessmentSet>(`/assessments/${existing.id}`, body)); }
      else { onSaved(await api.post<AssessmentSet>('/assessments', body)); }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-white">{existing ? 'Edit Assessment' : 'New MCQ Assessment'}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Title"><input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Customer Service Basics" className="input-field" /></Field>
          <Field label="Category"><input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Onboarding, Compliance" className="input-field" /></Field>
          <Field label="Passing Score (%)"><input type="number" required min={1} max={100} value={passing} onChange={(e) => setPassing(e.target.value)} className="input-field" /></Field>
          <Field label="Status">
            <div className="flex items-center gap-3">
              <Toggle value={active} onChange={setActive} />
              <span className={`text-sm ${active ? 'text-emerald-400' : 'text-theme-muted'}`}>{active ? 'Active' : 'Inactive'}</span>
            </div>
          </Field>
          {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs"><AlertCircle size={13} /> {error}</div>}
          <div className="flex gap-3 justify-end">
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

// ── MCQ Assessment Detail Modal ────────────────────────────────────────────────

function McqDetailModal({
  set, onClose, onUpdated, onDeleted,
}: { set: AssessmentSet; onClose: () => void; onUpdated: (s: AssessmentSet) => void; onDeleted: (id: string) => void }) {
  const [tab, setTab] = useState<McqDetailTab>('questions');
  const [questions, setQuestions] = useState<McqQuestion[]>([]);
  const [qLoading, setQLoading]   = useState(false);
  const [qError, setQError]       = useState('');
  const [showQForm, setShowQForm] = useState(false);
  const [editQ, setEditQ]         = useState<McqQuestion | undefined>();
  const [deletingQ, setDeletingQ] = useState<string | null>(null);
  const [results, setResults]     = useState<McqResult[]>([]);
  const [rLoading, setRLoading]   = useState(false);
  const [rError, setRError]       = useState('');
  const [deleting, setDeleting]   = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [showEdit, setShowEdit]   = useState(false);
  const [localSet, setLocalSet]   = useState(set);

  const loadQ = useCallback(async () => {
    setQLoading(true); setQError('');
    try { setQuestions(await api.get<McqQuestion[]>(`/assessments/${set.id}/questions`)); }
    catch (e: unknown) { setQError(e instanceof Error ? e.message : 'Failed.'); }
    finally { setQLoading(false); }
  }, [set.id]);

  const loadR = useCallback(async () => {
    setRLoading(true); setRError('');
    try { setResults(await api.get<McqResult[]>(`/assessments/${set.id}/results`)); }
    catch (e: unknown) { setRError(e instanceof Error ? e.message : 'Failed.'); }
    finally { setRLoading(false); }
  }, [set.id]);

  useEffect(() => { loadQ(); }, [loadQ]);
  useEffect(() => { if (tab === 'results') loadR(); }, [tab, loadR]);

  async function handleDeleteQ(qid: string) {
    setDeletingQ(qid);
    try { await api.delete(`/assessments/questions/${qid}`); setQuestions((p) => p.filter((q) => q.id !== qid)); }
    catch { /* ignore */ }
    finally { setDeletingQ(null); }
  }

  async function handleDelete() {
    setDeleting(true);
    try { await api.delete(`/assessments/${set.id}`); onDeleted(set.id); }
    catch (e: unknown) { setDeleteErr(e instanceof Error ? e.message : 'Failed.'); setDeleting(false); }
  }

  const TABS = [
    { key: 'questions' as McqDetailTab, label: 'Questions', icon: <FileQuestion size={13} /> },
    { key: 'results'   as McqDetailTab, label: 'Results',   icon: <BarChart3 size={13} /> },
    { key: 'settings'  as McqDetailTab, label: 'Settings',  icon: <Settings size={13} /> },
  ];

  return (
    <>
      <ModalShell title={localSet.title} onClose={onClose}>
        {/* Sub-header */}
        <div className="px-5 pt-2 pb-0 shrink-0">
          <div className="flex items-center gap-2">
            <StatusBadge active={localSet.is_active} />
            <span className="text-[10px] text-theme-muted">{localSet.category} · Pass at {Number(localSet.passing_score_pct).toFixed(0)}% · {questions.length} questions</span>
          </div>
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

        <div className="flex-1 overflow-y-auto">
          {/* Questions */}
          {tab === 'questions' && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-theme-muted">{questions.length} question{questions.length !== 1 ? 's' : ''}</p>
                <button type="button" onClick={() => { setEditQ(undefined); setShowQForm(true); }}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"><Plus size={13} /> Add Question</button>
              </div>
              {qLoading ? <div className="flex justify-center py-8"><SpinningDots size="md" className="text-emerald-accent" /></div>
              : qError ? <p className="text-danger text-sm">{qError}</p>
              : questions.length === 0 ? <div className="text-center py-10 text-theme-muted text-sm">No questions yet.</div>
              : (
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
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"><Settings size={12} /></button>
                          <button type="button" onClick={() => handleDeleteQ(q.id)} disabled={deletingQ === q.id}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-theme-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40">
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

          {/* Results */}
          {tab === 'results' && (
            <div className="p-5">
              {rLoading ? <div className="flex justify-center py-8"><SpinningDots size="md" className="text-emerald-accent" /></div>
              : rError ? <p className="text-danger text-sm">{rError}</p>
              : results.length === 0 ? <div className="text-center py-10 text-theme-muted text-sm">No results yet.</div>
              : (
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
                        <td className="py-3"><p className="text-white font-medium">{r.worker_display_name}</p><p className="text-xs text-theme-muted">{r.worker_country}</p></td>
                        <td className="py-3 text-right text-white font-bold">{Number(r.score_pct).toFixed(1)}%</td>
                        <td className="py-3 text-center">
                          {r.passed
                            ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-accent/10 px-2 py-0.5 rounded-full border border-emerald-accent/20">PASS</span>
                            : <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">FAIL</span>}
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

          {/* Settings */}
          {tab === 'settings' && (
            <div className="p-5 space-y-6">
              <div>
                <SectionTitle>Assessment Config</SectionTitle>
                {[
                  { label: 'Title', value: localSet.title }, { label: 'Category', value: localSet.category },
                  { label: 'Passing Score', value: `${Number(localSet.passing_score_pct).toFixed(0)}%` },
                  { label: 'Status', value: localSet.is_active ? 'Active' : 'Inactive' },
                  { label: 'Questions', value: questions.length },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <span className="text-theme-muted text-xs">{label}</span>
                    <span className="text-white font-medium text-xs">{value}</span>
                  </div>
                ))}
                <button type="button" onClick={() => setShowEdit(true)}
                  className="mt-4 btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"><Settings size={12} /> Edit Assessment</button>
              </div>
              <div>
                <SectionTitle>Leaderboard Contribution</SectionTitle>
                <div className="glass-panel rounded-xl p-4 border border-white/[0.06] space-y-2">
                  <p className="text-xs text-theme-muted">Passing contributes to the <span className="text-white">MCQ component</span> of the composite leaderboard score.</p>
                  {[
                    { label: 'MCQ weight', value: '20% of composite' },
                    { label: 'Pass threshold', value: `${Number(localSet.passing_score_pct).toFixed(0)}%` },
                    { label: 'Passed credit', value: 'Full score_pct' },
                    { label: 'Failed credit', value: 'score_pct × 0.5' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
                      <span className="text-xs text-theme-muted">{label}</span>
                      <span className="text-xs text-emerald-accent font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <SectionTitle>Danger Zone</SectionTitle>
                {deleteErr && <p className="text-xs text-red-400 mb-2">{deleteErr}</p>}
                {confirmDel ? (
                  <div className="glass-panel rounded-xl p-4 border border-red-500/30 bg-red-500/5">
                    <p className="text-xs text-red-300 mb-3">Permanently deletes the assessment and all questions. Cannot be undone.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleDelete} disabled={deleting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-60">
                        {deleting ? <SpinningDots size="sm" /> : <Trash2 size={12} />} Confirm Delete
                      </button>
                      <button type="button" onClick={() => setConfirmDel(false)} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDel(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-colors">
                    <Trash2 size={12} /> Delete Assessment
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </ModalShell>

      {showQForm && (
        <QuestionModal assessmentId={set.id} existing={editQ} nextOrder={questions.length}
          onSaved={(q) => {
            setQuestions((prev) => { const i = prev.findIndex((x) => x.id === q.id); return i >= 0 ? prev.map((x) => x.id === q.id ? q : x) : [...prev, q]; });
            setShowQForm(false);
          }}
          onClose={() => { setShowQForm(false); setEditQ(undefined); }} />
      )}
      {showEdit && (
        <McqFormModal existing={localSet}
          onSaved={(u) => { const m = { ...localSet, ...u }; setLocalSet(m); onUpdated(m); setShowEdit(false); }}
          onClose={() => setShowEdit(false)} />
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Task Assessment section
// ════════════════════════════════════════════════════════════════════════════════

type TaskDetailTab = 'overview' | 'results' | 'settings';

// ── Media uploader ─────────────────────────────────────────────────────────────

function MediaUploader({
  media, onChange,
}: { media: TaskMedia[]; onChange: (m: TaskMedia[]) => void }) {
  const [uploading, setUploading] = useState<UploadProgress | null>(null);
  const [error, setError]         = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');
    for (const file of Array.from(files)) {
      const maxMb = file.type.startsWith('video/') ? 200 : 20;
      if (file.size > maxMb * 1024 * 1024) { setError(`${file.name} exceeds ${maxMb} MB limit.`); continue; }
      try {
        setUploading({ name: file.name, progress: 0 });
        const uploaded = await uploadTaskMedia(file, (p) => setUploading(p));
        onChange([...media, uploaded]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : `Upload failed: ${file.name}`);
      }
    }
    setUploading(null);
  }

  async function remove(m: TaskMedia) {
    onChange(media.filter((x) => x.storage_path !== m.storage_path));
    await deleteTaskMedia(m.storage_path);
  }

  return (
    <div>
      <div
        className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-accent/40 hover:bg-emerald-accent/5 transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}>
        <Upload size={20} className="text-theme-muted mx-auto mb-2" />
        <p className="text-sm text-theme-muted">Drop images / videos here or <span className="text-emerald-accent">click to browse</span></p>
        <p className="text-[10px] text-theme-muted/60 mt-1">Images up to 20 MB · Videos up to 200 MB</p>
        <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden"
          onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {uploading && (
        <div className="mt-2 glass-panel rounded-xl p-3 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-white truncate">{uploading.name}</span>
            <span className="text-[10px] text-emerald-accent ml-2 shrink-0">{uploading.progress}%</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-accent rounded-full transition-all" style={{ width: `${uploading.progress}%` }} />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      {media.length > 0 && (
        <div className="mt-3 space-y-2">
          {media.map((m, i) => (
            <div key={i} className="flex items-center gap-3 glass-panel rounded-xl p-3 border border-white/[0.06]">
              {m.type === 'image'
                ? <ImageIcon size={16} className="text-blue-400 shrink-0" />
                : <Film size={16} className="text-purple-400 shrink-0" />}
              <span className="text-xs text-white truncate flex-1">{m.name}</span>
              <a href={m.url} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-theme-muted hover:text-white transition-colors shrink-0"><Eye size={12} /></a>
              <button type="button" onClick={() => remove(m)}
                className="text-theme-muted hover:text-red-400 transition-colors shrink-0"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Task Assessment Form Modal ─────────────────────────────────────────────────

function TaskFormModal({
  existing, onSaved, onClose,
}: { existing?: TaskAssessment; onSaved: (s: TaskAssessment) => void; onClose: () => void }) {
  const [title,       setTitle]       = useState(existing?.title ?? '');
  const [category,    setCategory]    = useState(existing?.category ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [instructions,setInstructions]= useState(existing?.instructions ?? '');
  const [media,       setMedia]       = useState<TaskMedia[]>(existing?.media_urls ?? []);
  const [isTimed,     setIsTimed]     = useState(existing?.is_timed ?? false);
  const [timeLimit,   setTimeLimit]   = useState(String(existing?.time_limit_minutes ?? 30));
  const [passing,     setPassing]     = useState(String(existing?.passing_score_pct ?? 70));
  const [active,      setActive]      = useState(existing?.is_active ?? true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    const body = {
      title, category, description, instructions,
      media_urls: media,
      is_timed: isTimed,
      time_limit_minutes: isTimed ? Number(timeLimit) : null,
      passing_score_pct: Number(passing),
      is_active: active,
    };
    try {
      if (existing) { onSaved(await api.patch<TaskAssessment>(`/task-assessments/${existing.id}`, body)); }
      else { onSaved(await api.post<TaskAssessment>('/task-assessments', body)); }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <h2 className="text-sm font-bold text-white">{existing ? 'Edit Task Assessment' : 'New Task Assessment'}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Title"><input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Data Entry Task" className="input-field" /></Field>
            <Field label="Category"><input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Practical, QA" className="input-field" /></Field>
          </div>

          <Field label="Task Description">
            <textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this task about? What will workers do?" className="input-field resize-none" />
          </Field>

          <Field label="Instructions">
            <textarea required rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)}
              placeholder="Step-by-step instructions for the worker…" className="input-field resize-none" />
          </Field>

          <Field label="Reference Media (Images / Videos)">
            <MediaUploader media={media} onChange={setMedia} />
          </Field>

          <div className="glass-panel rounded-xl p-4 border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer size={14} className="text-gold-accent" />
                <span className="text-sm text-white font-medium">Time Limit</span>
              </div>
              <div className="flex items-center gap-2">
                <Toggle value={isTimed} onChange={setIsTimed} />
                <span className={`text-xs ${isTimed ? 'text-emerald-400' : 'text-theme-muted'}`}>{isTimed ? 'Enabled' : 'Untimed'}</span>
              </div>
            </div>
            {isTimed && (
              <div className="flex items-center gap-3">
                <input type="number" min={1} max={480} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)}
                  className="input-field w-24" />
                <span className="text-sm text-theme-muted">minutes</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Passing Score (%)">
              <input type="number" required min={1} max={100} value={passing} onChange={(e) => setPassing(e.target.value)} className="input-field" />
            </Field>
            <Field label="Status">
              <div className="flex items-center gap-2 mt-1">
                <Toggle value={active} onChange={setActive} />
                <span className={`text-sm ${active ? 'text-emerald-400' : 'text-theme-muted'}`}>{active ? 'Active' : 'Inactive'}</span>
              </div>
            </Field>
          </div>

          {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs"><AlertCircle size={13} /> {error}</div>}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" className="text-emerald-accent" /> : <CheckCircle size={13} />}
              {existing ? 'Save' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Grade Result Panel ─────────────────────────────────────────────────────────

function GradePanel({
  result, onGraded,
}: { result: TaskResult; onGraded: (r: TaskResult) => void }) {
  const [score, setScore]   = useState(String(result.score_pct ?? ''));
  const [passed, setPassed] = useState(result.passed ?? false);
  const [notes, setNotes]   = useState(result.grader_notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const r = await api.patch<TaskResult>(`/task-assessments/results/${result.id}/grade`, {
        score_pct: Number(score), passed, grader_notes: notes || null,
      });
      onGraded(r);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed.'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 glass-panel rounded-xl p-4 border border-white/[0.06] space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gold-accent">Grade Submission</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-theme-muted mb-1 block">Score (%)</label>
          <input type="number" required min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="text-[10px] text-theme-muted mb-1 block">Outcome</label>
          <div className="flex gap-2 mt-1">
            {[true, false].map((v) => (
              <button key={String(v)} type="button" onClick={() => setPassed(v)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  passed === v
                    ? v ? 'bg-emerald-accent/20 text-emerald-400 border-emerald-accent/40' : 'bg-red-500/20 text-red-400 border-red-500/40'
                    : 'border-white/10 text-theme-muted hover:border-white/20'
                }`}>
                {v ? 'Pass' : 'Fail'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-theme-muted mb-1 block">Grader Notes (optional)</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Feedback for the worker…" className="input-field resize-none" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button type="submit" disabled={saving}
        className="btn-primary w-full text-xs py-1.5 flex items-center justify-center gap-1.5 disabled:opacity-60">
        {saving ? <SpinningDots size="sm" className="text-emerald-accent" /> : <CheckCircle size={12} />} Save Grade
      </button>
    </form>
  );
}

// ── Task Detail Modal ──────────────────────────────────────────────────────────

function TaskDetailModal({
  assessment, onClose, onUpdated, onDeleted,
}: { assessment: TaskAssessment; onClose: () => void; onUpdated: (a: TaskAssessment) => void; onDeleted: (id: string) => void }) {
  const [tab, setTab]         = useState<TaskDetailTab>('overview');
  const [localA, setLocalA]   = useState(assessment);
  const [results, setResults] = useState<TaskResult[]>([]);
  const [rLoading, setRLoading] = useState(false);
  const [rError, setRError]   = useState('');
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const loadR = useCallback(async () => {
    setRLoading(true); setRError('');
    try { setResults(await fetchTaskResults(localA.id)); }
    catch (e: unknown) { setRError(e instanceof Error ? e.message : 'Failed.'); }
    finally { setRLoading(false); }
  }, [localA.id]);

  useEffect(() => { if (tab === 'results') loadR(); }, [tab, loadR]);

  async function handleDelete() {
    setDeleting(true);
    try { await api.delete(`/task-assessments/${localA.id}`); onDeleted(localA.id); }
    catch (e: unknown) { setDeleteErr(e instanceof Error ? e.message : 'Failed.'); setDeleting(false); }
  }

  const STATUS_COLORS: Record<string, string> = {
    pending:     'bg-white/10 text-theme-muted border-white/10',
    in_progress: 'bg-gold-accent/20 text-yellow-400 border-gold-accent/30',
    submitted:   'bg-blue-500/20 text-blue-400 border-blue-500/30',
    graded:      'bg-emerald-accent/20 text-emerald-400 border-emerald-accent/30',
  };

  const TABS = [
    { key: 'overview' as TaskDetailTab, label: 'Overview', icon: <Eye size={13} /> },
    { key: 'results'  as TaskDetailTab, label: 'Results',  icon: <BarChart3 size={13} /> },
    { key: 'settings' as TaskDetailTab, label: 'Settings', icon: <Settings size={13} /> },
  ];

  return (
    <>
      <ModalShell title={localA.title} onClose={onClose}>
        <div className="px-5 pt-2 pb-0 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge active={localA.is_active} />
            <span className="text-[10px] text-theme-muted">{localA.category}</span>
            {localA.is_timed && (
              <span className="text-[10px] flex items-center gap-1 text-gold-accent">
                <Clock size={10} /> {localA.time_limit_minutes} min
              </span>
            )}
            <span className="text-[10px] text-theme-muted">Pass at {Number(localA.passing_score_pct).toFixed(0)}%</span>
          </div>
        </div>
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

        <div className="flex-1 overflow-y-auto">
          {/* Overview */}
          {tab === 'overview' && (
            <div className="p-5 space-y-5">
              <div>
                <SectionTitle>Description</SectionTitle>
                <p className="text-sm text-white/90 leading-relaxed">{localA.description}</p>
              </div>
              <div>
                <SectionTitle>Instructions</SectionTitle>
                <p className="text-sm text-white/90 leading-relaxed whitespace-pre-line">{localA.instructions}</p>
              </div>
              {localA.media_urls.length > 0 && (
                <div>
                  <SectionTitle>Reference Media ({localA.media_urls.length} file{localA.media_urls.length !== 1 ? 's' : ''})</SectionTitle>
                  <div className="space-y-2">
                    {localA.media_urls.map((m, i) => (
                      <div key={i} className="glass-panel rounded-xl border border-white/[0.06]">
                        {m.type === 'image' ? (
                          <a href={m.url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={m.url} alt={m.name} className="w-full max-h-64 object-contain rounded-xl" />
                          </a>
                        ) : (
                          <div className="p-3">
                            <video src={m.url} controls className="w-full rounded-lg max-h-56" />
                            <p className="text-xs text-theme-muted mt-1">{m.name}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {tab === 'results' && (
            <div className="p-5">
              {rLoading ? <div className="flex justify-center py-8"><SpinningDots size="md" className="text-emerald-accent" /></div>
              : rError ? <p className="text-danger text-sm">{rError}</p>
              : results.length === 0 ? <div className="text-center py-10 text-theme-muted text-sm">No submissions yet.</div>
              : (
                <div className="space-y-4">
                  {results.map((r) => (
                    <div key={r.id} className="glass-panel rounded-xl p-4 border border-white/[0.06]">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-sm text-white font-medium">{r.worker_display_name}</p>
                          <p className="text-xs text-theme-muted">{r.worker_country}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.score_pct !== null && (
                            <span className="text-sm font-bold text-white">{Number(r.score_pct).toFixed(1)}%</span>
                          )}
                          {r.passed !== null && (
                            r.passed
                              ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-accent/10 px-2 py-0.5 rounded-full border border-emerald-accent/20">PASS</span>
                              : <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">FAIL</span>
                          )}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${STATUS_COLORS[r.status] ?? ''}`}>
                            {r.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      {r.submission_notes && (
                        <p className="text-xs text-theme-muted mt-1 bg-white/[0.03] rounded-lg p-2 border border-white/[0.04]">
                          {r.submission_notes}
                        </p>
                      )}

                      {r.submission_media_urls && r.submission_media_urls.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {r.submission_media_urls.map((m, i) => (
                            <a key={i} href={m.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-theme-muted hover:text-white transition-colors">
                              {m.type === 'image' ? <ImageIcon size={11} /> : <Film size={11} />} {m.name}
                            </a>
                          ))}
                        </div>
                      )}

                      {r.grader_notes && (
                        <p className="text-xs text-emerald-400/80 mt-2 italic">&ldquo;{r.grader_notes}&rdquo;</p>
                      )}

                      {r.time_taken_seconds !== null && (
                        <p className="text-[10px] text-theme-muted mt-1 flex items-center gap-1">
                          <Clock size={10} /> {Math.floor(r.time_taken_seconds / 60)}m {r.time_taken_seconds % 60}s
                        </p>
                      )}

                      {r.status === 'submitted' && (
                        gradingId === r.id
                          ? <GradePanel result={r} onGraded={(updated) => {
                              setResults((p) => p.map((x) => x.id === updated.id ? updated : x));
                              setGradingId(null);
                            }} />
                          : <button type="button" onClick={() => setGradingId(r.id)}
                              className="mt-3 btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"><CheckCircle size={12} /> Grade Submission</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Settings */}
          {tab === 'settings' && (
            <div className="p-5 space-y-6">
              <div>
                <SectionTitle>Task Config</SectionTitle>
                {[
                  { label: 'Title',        value: localA.title },
                  { label: 'Category',     value: localA.category },
                  { label: 'Timed',        value: localA.is_timed ? `Yes — ${localA.time_limit_minutes} min` : 'No' },
                  { label: 'Passing Score',value: `${Number(localA.passing_score_pct).toFixed(0)}%` },
                  { label: 'Media files',  value: localA.media_urls.length },
                  { label: 'Status',       value: localA.is_active ? 'Active' : 'Inactive' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <span className="text-theme-muted text-xs">{label}</span>
                    <span className="text-white font-medium text-xs">{value}</span>
                  </div>
                ))}
                <button type="button" onClick={() => setShowEdit(true)}
                  className="mt-4 btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"><Settings size={12} /> Edit Task</button>
              </div>
              <div>
                <SectionTitle>Leaderboard Contribution</SectionTitle>
                <div className="glass-panel rounded-xl p-4 border border-white/[0.06] space-y-2">
                  <p className="text-xs text-theme-muted">Graded task results contribute to the <span className="text-white">subjective component</span> of composite leaderboard scoring.</p>
                  {[
                    { label: 'Subjective component weight', value: '20% of composite' },
                    { label: 'Pass threshold', value: `${Number(localA.passing_score_pct).toFixed(0)}%` },
                    { label: 'Score contribution', value: 'score_pct / 100 × weight' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
                      <span className="text-xs text-theme-muted">{label}</span>
                      <span className="text-xs text-emerald-accent font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <SectionTitle>Danger Zone</SectionTitle>
                {deleteErr && <p className="text-xs text-red-400 mb-2">{deleteErr}</p>}
                {confirmDel ? (
                  <div className="glass-panel rounded-xl p-4 border border-red-500/30 bg-red-500/5">
                    <p className="text-xs text-red-300 mb-3">Permanently deletes this task and all submissions. Cannot be undone.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleDelete} disabled={deleting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-60">
                        {deleting ? <SpinningDots size="sm" /> : <Trash2 size={12} />} Confirm Delete
                      </button>
                      <button type="button" onClick={() => setConfirmDel(false)} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDel(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-colors">
                    <Trash2 size={12} /> Delete Task Assessment
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </ModalShell>

      {showEdit && (
        <TaskFormModal existing={localA}
          onSaved={(u) => { const m = { ...localA, ...u }; setLocalA(m); onUpdated(m); setShowEdit(false); }}
          onClose={() => setShowEdit(false)} />
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════════════════

type AssessmentKind = 'mcq' | 'task';

export default function AssessmentsPage() {
  const [kind, setKind] = useState<AssessmentKind>('mcq');

  // MCQ state
  const [mcqSets,    setMcqSets]    = useState<AssessmentSet[]>([]);
  const [mcqLoading, setMcqLoading] = useState(true);
  const [mcqError,   setMcqError]   = useState('');
  const [showMcqCreate, setShowMcqCreate] = useState(false);
  const [selectedMcq,   setSelectedMcq]   = useState<AssessmentSet | null>(null);

  // Task state
  const [tasks,       setTasks]       = useState<TaskAssessment[]>([]);
  const [taskLoading, setTaskLoading] = useState(true);
  const [taskError,   setTaskError]   = useState('');
  const [showTaskCreate, setShowTaskCreate] = useState(false);
  const [selectedTask,   setSelectedTask]   = useState<TaskAssessment | null>(null);

  async function loadMcq() {
    setMcqLoading(true); setMcqError('');
    try { setMcqSets(await api.get<AssessmentSet[]>('/assessments')); }
    catch (e: unknown) { setMcqError(e instanceof Error ? e.message : 'Failed.'); }
    finally { setMcqLoading(false); }
  }

  async function loadTasks() {
    setTaskLoading(true); setTaskError('');
    try { setTasks(await fetchTaskAssessments()); }
    catch (e: unknown) { setTaskError(e instanceof Error ? e.message : 'Failed.'); }
    finally { setTaskLoading(false); }
  }

  useEffect(() => { loadMcq(); loadTasks(); }, []);

  const totalAssessments = mcqSets.length + tasks.length;
  const totalAttempts    = mcqSets.reduce((a, s) => a + s.result_count, 0)
                         + tasks.reduce((a, t) => a + t.result_count, 0);
  const activeCount      = mcqSets.filter((s) => s.is_active).length + tasks.filter((t) => t.is_active).length;

  return (
    <div>
      <PageHeader
        title="Assessment Builder"
        description="Manage MCQ exams and task-based assessments. Results map to leaderboard scores."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex gap-1 glass-panel p-1 rounded-xl">
              {([['mcq', 'MCQ Exams', <FileQuestion key="m" size={13} />], ['task', 'Task Based', <Film key="t" size={13} />]] as const).map(([k, label, icon]) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    kind === k ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-white'
                  }`}>
                  {icon} {label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    kind === k ? 'bg-emerald-accent/30 text-emerald-300' : 'bg-white/10 text-theme-muted'
                  }`}>
                    {k === 'mcq' ? mcqSets.length : tasks.length}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => kind === 'mcq' ? setShowMcqCreate(true) : setShowTaskCreate(true)}
              className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
              <Plus size={15} /> New {kind === 'mcq' ? 'MCQ' : 'Task'}
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Assessments', value: totalAssessments, sub: `${activeCount} active` },
          { label: 'MCQ Exams',         value: mcqSets.length,   sub: `${mcqSets.reduce((a, s) => a + s.question_count, 0)} questions` },
          { label: 'Total Attempts',    value: totalAttempts,    sub: 'by workers' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="glass-panel p-4">
            <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
            <p className="text-xs font-semibold text-white mt-0.5">{label}</p>
            <p className="text-[10px] text-theme-muted mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* MCQ list */}
      {kind === 'mcq' && (
        mcqLoading ? <div className="flex justify-center py-20"><SpinningDots size="lg" className="text-emerald-accent" /></div>
        : mcqError ? <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm"><AlertCircle size={16} /> {mcqError}</div>
        : mcqSets.length === 0 ? <div className="glass-panel p-12 text-center text-theme-muted text-sm">No MCQ assessments yet.</div>
        : (
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
                {mcqSets.map((s) => (
                  <tr key={s.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => setSelectedMcq(s)}>
                    <td className="px-4 py-3"><p className="text-white font-medium">{s.title}</p></td>
                    <td className="px-4 py-3 text-xs text-theme-muted hidden sm:table-cell">{s.category}</td>
                    <td className="px-4 py-3 text-center text-white font-bold tabular-nums">{s.question_count}</td>
                    <td className="px-4 py-3 text-center text-white tabular-nums hidden md:table-cell">{s.result_count}</td>
                    <td className="px-4 py-3 text-center text-theme-muted text-xs hidden md:table-cell">{Number(s.passing_score_pct).toFixed(0)}% to pass</td>
                    <td className="px-4 py-3 text-center"><StatusBadge active={s.is_active} /></td>
                    <td className="px-4 py-3 text-right"><ChevronRight size={14} className="text-theme-muted" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Task list */}
      {kind === 'task' && (
        taskLoading ? <div className="flex justify-center py-20"><SpinningDots size="lg" className="text-emerald-accent" /></div>
        : taskError ? <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm"><AlertCircle size={16} /> {taskError}</div>
        : tasks.length === 0 ? <div className="glass-panel p-12 text-center text-theme-muted text-sm">No task assessments yet.</div>
        : (
          <div className="glass-panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Task</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden sm:table-cell">Category</th>
                  <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Media</th>
                  <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">Timer</th>
                  <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted hidden md:table-cell">Submissions</th>
                  <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Status</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => setSelectedTask(t)}>
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{t.title}</p>
                      <p className="text-[10px] text-theme-muted mt-0.5 line-clamp-1">{t.description}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-theme-muted hidden sm:table-cell">{t.category}</td>
                    <td className="px-4 py-3 text-center">
                      {t.media_urls.length > 0 ? (
                        <span className="flex items-center justify-center gap-1 text-xs text-theme-muted">
                          {t.media_urls.some((m) => m.type === 'image') && <ImageIcon size={12} />}
                          {t.media_urls.some((m) => m.type === 'video') && <Film size={12} />}
                          <span>{t.media_urls.length}</span>
                        </span>
                      ) : <span className="text-theme-muted/40 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      {t.is_timed
                        ? <span className="flex items-center justify-center gap-1 text-xs text-gold-accent"><Timer size={11} /> {t.time_limit_minutes}m</span>
                        : <span className="text-theme-muted/40 text-xs">None</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-white tabular-nums hidden md:table-cell">{t.result_count}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge active={t.is_active} /></td>
                    <td className="px-4 py-3 text-right"><ChevronRight size={14} className="text-theme-muted" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* MCQ modals */}
      {showMcqCreate && (
        <McqFormModal
          onSaved={(c) => { setMcqSets((p) => [...p, { ...c, question_count: 0, result_count: 0 }]); setShowMcqCreate(false); }}
          onClose={() => setShowMcqCreate(false)} />
      )}
      {selectedMcq && (
        <McqDetailModal set={selectedMcq} onClose={() => setSelectedMcq(null)}
          onUpdated={(u) => { setMcqSets((p) => p.map((s) => s.id === u.id ? { ...s, ...u } : s)); setSelectedMcq((p) => p ? { ...p, ...u } : p); }}
          onDeleted={(id) => { setMcqSets((p) => p.filter((s) => s.id !== id)); setSelectedMcq(null); }} />
      )}

      {/* Task modals */}
      {showTaskCreate && (
        <TaskFormModal
          onSaved={(c) => { setTasks((p) => [...p, { ...c, result_count: 0 }]); setShowTaskCreate(false); }}
          onClose={() => setShowTaskCreate(false)} />
      )}
      {selectedTask && (
        <TaskDetailModal assessment={selectedTask} onClose={() => setSelectedTask(null)}
          onUpdated={(u) => { setTasks((p) => p.map((t) => t.id === u.id ? { ...t, ...u } : t)); setSelectedTask((p) => p ? { ...p, ...u } : p); }}
          onDeleted={(id) => { setTasks((p) => p.filter((t) => t.id !== id)); setSelectedTask(null); }} />
      )}
    </div>
  );
}
