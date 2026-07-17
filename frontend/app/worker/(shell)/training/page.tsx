'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, AlertCircle, BookOpen, Check, CheckCircle,
  ExternalLink, FileText, GraduationCap, Link2, PlayCircle, Star,
} from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Me {
  id: string;
  work_ready: boolean;
}

interface Lesson {
  id: string;
  title: string;
  content_type: 'text' | 'link' | 'video' | 'pdf' | string;
  content: string | null;
  media_url: string | null;
  sort_order: number;
}

interface TrainingModule {
  id: string;
  title: string;
  description: string | null;
  mcq_set_id: string | null;
  task_assessment_id: string | null;
  is_mandatory_for_new_workers: boolean;
  is_active: boolean;
  lessons: Lesson[];
  progress_status: 'not_started' | 'in_progress' | 'completed' | null;
  completed_lesson_ids: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PROGRESS_CHIP: Record<string, { label: string; classes: string }> = {
  not_started: { label: 'Not started', classes: 'bg-white/10 text-theme-muted border-white/10' },
  in_progress: { label: 'In progress', classes: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  completed:   { label: 'Completed',   classes: 'bg-emerald-accent/20 text-emerald-accent border-emerald-accent/30' },
};

function ProgressChip({ status }: { status: string | null }) {
  const chip = PROGRESS_CHIP[status ?? 'not_started'] ?? PROGRESS_CHIP.not_started;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${chip.classes}`}>
      {chip.label}
    </span>
  );
}

const CONTENT_ICON: Record<string, typeof FileText> = {
  text: FileText,
  link: Link2,
  video: PlayCircle,
  pdf: FileText,
};

// ── Lesson viewer (inline detail view) ─────────────────────────────────────────

function ModuleViewer({
  module,
  onBack,
  onProgressChange,
}: {
  module: TrainingModule;
  onBack: () => void;
  onProgressChange: (moduleId: string, completedLessonIds: string[], status: string | null) => void;
}) {
  const lessons = useMemo(
    () => [...module.lessons].sort((a, b) => a.sort_order - b.sort_order),
    [module.lessons],
  );
  const [selectedId, setSelectedId] = useState<string | null>(lessons[0]?.id ?? null);
  const [completedIds, setCompletedIds] = useState<string[]>(module.completed_lesson_ids ?? []);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-start a not-started module.
  useEffect(() => {
    if (module.progress_status === null || module.progress_status === 'not_started') {
      api.post(`/training/modules/${module.id}/start`, {})
        .then(() => onProgressChange(module.id, completedIds, 'in_progress'))
        .catch(() => { /* non-fatal — completion call will surface real errors */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module.id]);

  const selected = lessons.find((l) => l.id === selectedId) ?? null;
  const hasLinkedAssessment = Boolean(module.mcq_set_id || module.task_assessment_id);

  async function markComplete(lesson: Lesson) {
    setMarking(true);
    setError(null);
    try {
      const progress = await api.post<{ status?: string; completed_lesson_ids?: string[] }>(
        `/training/modules/${module.id}/lessons/${lesson.id}/complete`, {},
      );
      const updated = progress?.completed_lesson_ids
        ?? (completedIds.includes(lesson.id) ? completedIds : [...completedIds, lesson.id]);
      setCompletedIds(updated);
      onProgressChange(module.id, updated, progress?.status ?? null);
      // Advance to the next incomplete lesson, if any.
      const next = lessons.find((l) => l.id !== lesson.id && !updated.includes(l.id));
      if (next) setSelectedId(next.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark lesson complete');
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-theme-muted hover:text-white transition-colors"
      >
        <ArrowLeft size={14} /> Back to modules
      </button>

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-white tracking-tight">{module.title}</h2>
          {module.is_mandatory_for_new_workers && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold-accent/20 text-gold-accent border border-gold-accent/30">
              <Star size={10} /> Mandatory
            </span>
          )}
        </div>
        {module.description && <p className="text-xs text-theme-muted mt-2 whitespace-pre-wrap">{module.description}</p>}
        <p className="text-xs text-emerald-accent font-semibold mt-3">
          {completedIds.length} of {lessons.length} lesson{lessons.length !== 1 ? 's' : ''} completed
        </p>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-5 items-start">
        {/* Lesson list */}
        <div className="glass-panel rounded-2xl p-3 space-y-1">
          {lessons.map((l, i) => {
            const done = completedIds.includes(l.id);
            const active = l.id === selectedId;
            const Icon = CONTENT_ICON[l.content_type] ?? FileText;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedId(l.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  active ? 'bg-emerald-accent/10 border border-emerald-accent/30' : 'border border-transparent hover:bg-white/[0.04]'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                  done
                    ? 'bg-emerald-accent/20 text-emerald-accent border border-emerald-accent/40'
                    : 'bg-white/[0.06] text-theme-muted border border-white/10'
                }`}>
                  {done ? <Check size={12} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-xs font-semibold truncate ${active ? 'text-white' : 'text-theme-muted'}`}>{l.title}</span>
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-theme-muted mt-0.5">
                    <Icon size={10} /> {l.content_type}
                  </span>
                </span>
              </button>
            );
          })}
          {lessons.length === 0 && (
            <p className="text-xs text-theme-muted p-3">This module has no lessons yet.</p>
          )}
        </div>

        {/* Lesson content */}
        <div className="glass-panel rounded-2xl p-6 min-h-[300px] flex flex-col">
          {selected ? (
            <>
              <h3 className="text-base font-bold text-white">{selected.title}</h3>
              <div className="mt-4 flex-1">
                {selected.content_type === 'text' && (
                  <p className="text-sm text-theme-muted whitespace-pre-wrap leading-relaxed">
                    {selected.content ?? 'No content.'}
                  </p>
                )}
                {selected.content_type === 'link' && (
                  selected.media_url ? (
                    <a
                      href={selected.media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-sm font-semibold hover:bg-emerald-accent/20 transition-colors"
                    >
                      <ExternalLink size={15} /> Open resource
                    </a>
                  ) : <p className="text-sm text-theme-muted">No link provided.</p>
                )}
                {selected.content_type === 'video' && (
                  selected.media_url ? (
                    <div className="space-y-3">
                      <video controls src={selected.media_url} className="w-full rounded-xl border border-white/10 bg-black" />
                      <a
                        href={selected.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-emerald-accent hover:underline"
                      >
                        <ExternalLink size={12} /> Open video in a new tab
                      </a>
                    </div>
                  ) : <p className="text-sm text-theme-muted">No video provided.</p>
                )}
                {selected.content_type === 'pdf' && (
                  selected.media_url ? (
                    <a
                      href={selected.media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-sm font-semibold hover:bg-emerald-accent/20 transition-colors"
                    >
                      <FileText size={15} /> Open PDF
                    </a>
                  ) : <p className="text-sm text-theme-muted">No PDF provided.</p>
                )}
                {selected.content && selected.content_type !== 'text' && (
                  <p className="text-xs text-theme-muted whitespace-pre-wrap mt-4">{selected.content}</p>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs mt-4">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-white/[0.06]">
                {completedIds.includes(selected.id) ? (
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-accent">
                    <CheckCircle size={16} /> Lesson completed
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => markComplete(selected)}
                    disabled={marking}
                    className="btn-primary text-sm py-2 px-5 flex items-center gap-2 disabled:opacity-60"
                  >
                    {marking ? <SpinningDots size="sm" className="text-white" /> : <Check size={14} />}
                    Mark lesson complete
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-theme-muted m-auto">Select a lesson to begin.</p>
          )}
        </div>
      </div>

      {hasLinkedAssessment && (
        <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center gap-3 border border-gold-accent/20">
          <GraduationCap size={16} className="text-gold-accent shrink-0" />
          <p className="text-xs text-theme-muted flex-1">
            Finish by passing the linked assessment — this module completes automatically once all lessons are done and the assessment is passed.
          </p>
          <Link href="/worker/assessments" className="btn-secondary text-xs py-1.5 px-3">
            Go to assessments
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Me>('/workers/me'),
      api.get<TrainingModule[]>('/training/my-modules'),
    ])
      .then(([worker, mods]) => { setMe(worker); setModules(mods); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load training'))
      .finally(() => setLoading(false));
  }, []);

  function handleProgressChange(moduleId: string, completedLessonIds: string[], status: string | null) {
    setModules((prev) => prev.map((m) => m.id === moduleId
      ? {
          ...m,
          completed_lesson_ids: completedLessonIds,
          progress_status: (status ?? (m.progress_status === null ? 'in_progress' : m.progress_status)) as TrainingModule['progress_status'],
        }
      : m));
  }

  const openModule = modules.find((m) => m.id === openModuleId) ?? null;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <SpinningDots size="lg" className="text-emerald-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <PageHeader
        title="Training"
        description="Complete your assigned training modules and linked assessments."
      />

      {me?.work_ready === false && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-400">Onboarding required</p>
            <p className="text-xs text-amber-400/80 mt-1">
              Complete the mandatory training below. An admin will clear you to start work.
            </p>
          </div>
        </div>
      )}

      {error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      ) : openModule ? (
        <ModuleViewer
          module={openModule}
          onBack={() => setOpenModuleId(null)}
          onProgressChange={handleProgressChange}
        />
      ) : modules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-12 text-center">
          <BookOpen size={22} className="mx-auto text-theme-muted mb-3" />
          <p className="text-sm text-theme-muted">No training modules assigned yet.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {modules.map((m) => {
            const total = m.lessons.length;
            const done = (m.completed_lesson_ids ?? []).length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setOpenModuleId(m.id)}
                className="glass-panel glass-panel-hover rounded-2xl p-6 text-left flex flex-col gap-3 transition-all duration-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-bold text-white">{m.title}</h3>
                  <ProgressChip status={m.progress_status} />
                </div>
                {m.description && (
                  <p className="text-xs text-theme-muted line-clamp-2 whitespace-pre-wrap">{m.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {m.is_mandatory_for_new_workers && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold-accent/20 text-gold-accent border border-gold-accent/30">
                      <Star size={10} /> Mandatory
                    </span>
                  )}
                  <span className="text-[11px] text-theme-muted">
                    {total} lesson{total !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="mt-auto">
                  <div className="flex items-center justify-between text-[11px] text-theme-muted mb-1.5">
                    <span>{done} / {total} lessons</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${m.progress_status === 'completed' ? 'bg-emerald-accent' : 'bg-blue-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
