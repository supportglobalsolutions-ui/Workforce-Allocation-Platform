'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Award, CheckCircle, ChevronDown, ChevronUp,
  ClipboardList, Clock, ExternalLink, Plus, Send, Trash2, XCircle,
} from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AvailableAssessment {
  id: string;
  title: string;
  category: string | null;
  passing_score_pct: number;
  question_count: number;
  best_score_pct: number | null;
  passed: boolean;
  attempts: number;
}

interface TakeQuestion {
  id: string;
  prompt: string;
  options: unknown[];
  sort_order: number;
}

interface SubmitResult {
  score_pct: number;
  passed: boolean;
}

interface TaskAssessment {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  instructions: string | null;
  media_urls: string[];
  is_timed: boolean;
  time_limit_minutes: number | null;
  passing_score_pct: number;
}

interface TaskResult {
  id: string;
  task_assessment_id: string;
  status: 'pending' | 'in_progress' | 'submitted' | 'graded' | string;
  score_pct: number | null;
  passed: boolean | null;
  grader_notes: string | null;
  submitted_at: string | null;
}

type Tab = 'mcq' | 'tasks';

// ── Option rendering (defensive per API contract) ─────────────────────────────

function optionKey(item: unknown, index: number): string {
  if (item && typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    return String(obj.key ?? index);
  }
  return String(index);
}

function optionText(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.label === 'string') return obj.label;
    return JSON.stringify(item);
  }
  return String(item);
}

// ── MCQ take flow (inline view) ────────────────────────────────────────────────

function McqTakeView({
  assessment,
  onExit,
  onFinished,
}: {
  assessment: AvailableAssessment;
  onExit: () => void;
  onFinished: () => void;
}) {
  const [questions, setQuestions] = useState<TakeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const inProgress = !result && !loading && questions.length > 0;

  useEffect(() => {
    api.get<TakeQuestion[]>(`/assessments/${assessment.id}/take`)
      .then((qs) => setQuestions([...qs].sort((a, b) => a.sort_order - b.sort_order)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load questions'))
      .finally(() => setLoading(false));
  }, [assessment.id]);

  // Warn on browser navigation while mid-test.
  useEffect(() => {
    if (!inProgress) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [inProgress]);

  const answeredCount = Object.keys(answers).length;

  function handleBack() {
    if (inProgress && answeredCount > 0) {
      if (!window.confirm('Leave this assessment? Your answers will be discarded.')) return;
    }
    onExit();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<SubmitResult>(`/assessments/${assessment.id}/submit`, { answers });
      setResult(res);
      onFinished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit answers');
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetake() {
    setResult(null);
    setAnswers({});
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-theme-muted hover:text-white transition-colors"
      >
        <ArrowLeft size={14} /> Back to assessments
      </button>

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">{assessment.title}</h2>
            <p className="text-xs text-theme-muted mt-1">
              {assessment.question_count} question{assessment.question_count !== 1 ? 's' : ''} · pass at {assessment.passing_score_pct}%
            </p>
          </div>
          {inProgress && (
            <span className="text-xs font-bold text-emerald-accent bg-emerald-accent/10 border border-emerald-accent/30 rounded-full px-3 py-1">
              {answeredCount} / {questions.length} answered
            </span>
          )}
        </div>

        {inProgress && (
          <div className="mt-4 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-accent transition-all duration-300"
              style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : result ? (
        <div className={`glass-panel rounded-2xl p-8 text-center border ${result.passed ? 'border-emerald-accent/30' : 'border-danger/30'}`}>
          <span className={`inline-flex w-16 h-16 rounded-full items-center justify-center mb-4 ${
            result.passed ? 'bg-emerald-accent/10 text-emerald-accent' : 'bg-danger/10 text-danger'
          }`}>
            {result.passed ? <CheckCircle size={30} /> : <XCircle size={30} />}
          </span>
          <p className="text-4xl font-black text-theme-heading tracking-tight">{Number(result.score_pct).toFixed(0)}%</p>
          <p className={`mt-2 text-sm font-bold uppercase tracking-widest ${result.passed ? 'text-emerald-accent' : 'text-danger'}`}>
            {result.passed ? 'Passed' : 'Not passed'}
          </p>
          <p className="text-xs text-theme-muted mt-2">Passing score: {assessment.passing_score_pct}%</p>
          <div className="flex justify-center gap-3 mt-6">
            {!result.passed && (
              <button type="button" onClick={handleRetake} className="btn-primary text-sm py-2 px-5">Retake assessment</button>
            )}
            <button type="button" onClick={onExit} className="btn-secondary text-sm py-2 px-5">Back to assessments</button>
          </div>
        </div>
      ) : (
        <>
          {questions.map((q, qi) => (
            <div key={q.id} className="glass-panel rounded-2xl p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gold-accent mb-2">Question {qi + 1} of {questions.length}</p>
              <p className="text-sm font-semibold text-white whitespace-pre-wrap">{q.prompt}</p>
              <div className="mt-4 space-y-2">
                {(Array.isArray(q.options) ? q.options : []).map((opt, oi) => {
                  const key = optionKey(opt, oi);
                  const selected = answers[q.id] === key;
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                        selected
                          ? 'border-emerald-accent/50 bg-emerald-accent/10'
                          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={selected}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: key }))}
                        className="accent-emerald-500"
                      />
                      <span className={`text-sm ${selected ? 'text-white font-medium' : 'text-theme-muted'}`}>
                        {optionText(opt)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {questions.length > 0 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || answeredCount < questions.length}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? <SpinningDots size="sm" className="text-white" /> : <Send size={15} />}
              {answeredCount < questions.length
                ? `Answer all questions (${answeredCount}/${questions.length})`
                : 'Submit answers'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Task assessment card ───────────────────────────────────────────────────────

function TaskCard({
  task,
  latestResult,
  onSubmitted,
}: {
  task: TaskAssessment;
  latestResult: TaskResult | null;
  onSubmitted: () => void;
}) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notes, setNotes] = useState('');
  const [urls, setUrls] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/task-assessments/${task.id}/submit`, {
        submission_notes: notes,
        submission_media_urls: urls.map((u) => u.trim()).filter(Boolean),
      });
      setShowForm(false);
      setNotes('');
      setUrls(['']);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  const awaitingGrade = latestResult && (latestResult.status === 'submitted' || latestResult.status === 'in_progress' || latestResult.status === 'pending');
  const graded = latestResult?.status === 'graded';

  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">{task.title}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {task.category && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {task.category}
              </span>
            )}
            {task.is_timed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold-accent/20 text-gold-accent border border-gold-accent/30">
                <Clock size={10} /> Timed{task.time_limit_minutes ? ` · ${task.time_limit_minutes} min` : ''}
              </span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">
              Pass at {task.passing_score_pct}%
            </span>
          </div>
        </div>
        <span className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-theme-muted flex items-center justify-center shrink-0">
          <ClipboardList size={16} />
        </span>
      </div>

      {task.description && <p className="text-xs text-theme-muted whitespace-pre-wrap">{task.description}</p>}

      {task.instructions && (
        <div>
          <button
            type="button"
            onClick={() => setShowInstructions((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-accent hover:opacity-80 transition-opacity"
          >
            {showInstructions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showInstructions ? 'Hide instructions' : 'View instructions'}
          </button>
          {showInstructions && (
            <p className="mt-2 text-xs text-theme-muted whitespace-pre-wrap rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
              {task.instructions}
            </p>
          )}
        </div>
      )}

      {task.media_urls?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {task.media_urls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-emerald-accent hover:border-emerald-accent/40 transition-colors"
            >
              <ExternalLink size={12} /> Reference {i + 1}
            </a>
          ))}
        </div>
      )}

      {/* Latest result */}
      {latestResult && (
        <div className={`rounded-xl border p-3.5 text-xs ${
          graded
            ? latestResult.passed
              ? 'border-emerald-accent/30 bg-emerald-accent/5'
              : 'border-danger/30 bg-danger/5'
            : 'border-amber-500/30 bg-amber-500/5'
        }`}>
          {graded ? (
            <>
              <p className={`font-bold ${latestResult.passed ? 'text-emerald-accent' : 'text-danger'}`}>
                Graded: {latestResult.score_pct != null ? `${Number(latestResult.score_pct).toFixed(0)}%` : '—'} · {latestResult.passed ? 'Passed' : 'Not passed'}
              </p>
              {latestResult.grader_notes && (
                <p className="text-theme-muted mt-1.5 whitespace-pre-wrap">{latestResult.grader_notes}</p>
              )}
            </>
          ) : awaitingGrade ? (
            <p className="font-semibold text-amber-400">
              Submitted — awaiting grading
              {latestResult.submitted_at ? ` (${new Date(latestResult.submitted_at).toLocaleDateString()})` : ''}
            </p>
          ) : null}
        </div>
      )}

      {/* Submit flow */}
      {showForm ? (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-white/[0.06] pt-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Submission Notes</label>
            <textarea
              rows={4}
              required
              placeholder="Describe your work, decisions, and anything the grader should know…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field resize-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Evidence URLs (optional)</label>
            <div className="space-y-2">
              {urls.map((u, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://…"
                    value={u}
                    onChange={(e) => setUrls((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    className="input-field flex-1"
                  />
                  {urls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setUrls((prev) => prev.filter((_, j) => j !== i))}
                      className="w-9 h-9 shrink-0 self-center flex items-center justify-center rounded-lg text-theme-muted hover:text-danger border border-white/10 bg-white/[0.03] transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setUrls((prev) => [...prev, ''])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-accent hover:opacity-80 transition-opacity"
            >
              <Plus size={13} /> Add another URL
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm py-2 disabled:opacity-60">
              {submitting ? <SpinningDots size="sm" className="text-white" /> : <Send size={14} />}
              Submit for grading
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="btn-primary text-sm py-2 mt-auto"
        >
          {awaitingGrade ? 'Submit again' : graded ? 'Resubmit' : 'Submit work'}
        </button>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AssessmentCenterPage() {
  const [tab, setTab] = useState<Tab>('mcq');

  const [mcqs, setMcqs] = useState<AvailableAssessment[]>([]);
  const [tasks, setTasks] = useState<TaskAssessment[]>([]);
  const [taskResults, setTaskResults] = useState<TaskResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taking, setTaking] = useState<AvailableAssessment | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [availableMcqs, availableTasks, myResults] = await Promise.all([
        api.get<AvailableAssessment[]>('/assessments/available'),
        api.get<TaskAssessment[]>('/task-assessments/available'),
        api.get<TaskResult[]>('/task-assessments/results/mine'),
      ]);
      setMcqs(availableMcqs);
      setTasks(availableTasks);
      setTaskResults(myResults);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Latest result per task (by submitted_at, falling back to array order).
  const latestByTask = useMemo(() => {
    const map = new Map<string, TaskResult>();
    for (const r of taskResults) {
      const existing = map.get(r.task_assessment_id);
      if (!existing) { map.set(r.task_assessment_id, r); continue; }
      const a = r.submitted_at ? new Date(r.submitted_at).getTime() : 0;
      const b = existing.submitted_at ? new Date(existing.submitted_at).getTime() : 0;
      if (a >= b) map.set(r.task_assessment_id, r);
    }
    return map;
  }, [taskResults]);

  if (taking) {
    return (
      <McqTakeView
        assessment={taking}
        onExit={() => setTaking(null)}
        onFinished={() => { load(); }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Assessment Center"
        description="MCQ tests and graded task assessments — results feed your composite quality score."
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 w-fit mb-6">
        {([
          { key: 'mcq', label: 'MCQ Assessments', count: mcqs.length },
          { key: 'tasks', label: 'Task Assessments', count: tasks.length },
        ] as { key: Tab; label: string; count: number }[]).map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === key ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-white'
            }`}
          >
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              tab === key ? 'bg-emerald-accent/20 text-emerald-400' : 'bg-white/10 text-theme-muted'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      ) : tab === 'mcq' ? (
        mcqs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-12 text-center">
            <p className="text-sm text-theme-muted">No MCQ assessments available yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mcqs.map((a) => (
              <div key={a.id} className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white">{a.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {a.category && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          {a.category}
                        </span>
                      )}
                      {a.passed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-accent/20 text-emerald-accent border border-emerald-accent/30">
                          <Award size={10} /> Passed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Questions</p>
                    <p className="text-white font-semibold mt-0.5">{a.question_count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Passing</p>
                    <p className="text-white font-semibold mt-0.5">{a.passing_score_pct}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Attempts</p>
                    <p className="text-white font-semibold mt-0.5">{a.attempts}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Best Score</p>
                    <p className={`font-semibold mt-0.5 ${a.passed ? 'text-emerald-accent' : 'text-white'}`}>
                      {a.best_score_pct != null ? `${Number(a.best_score_pct).toFixed(0)}%` : '—'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTaking(a)}
                  className={`mt-auto text-sm py-2 ${a.passed ? 'btn-secondary' : 'btn-primary'}`}
                >
                  {a.attempts > 0 ? 'Retake assessment' : 'Take assessment'}
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-12 text-center">
            <p className="text-sm text-theme-muted">No task assessments available yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {tasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                latestResult={latestByTask.get(t.id) ?? null}
                onSubmitted={load}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
