'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, ArrowLeft, BookOpen, Check, FileText, GraduationCap,
  Link2, Pencil, PlayCircle, Plus, Star, Trash2, X,
} from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { QUALITY_TABS } from '@/components/platform/AdminSectionTabs';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Lesson {
  id: string;
  module_id: string;
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
  lessons?: Lesson[];
}

interface McqSetOption { id: string; title: string; question_count: number; }
interface TaskOption { id: string; title: string; }

interface ProgressRow {
  module_id: string;
  worker_id: string;
  status: string;
  completed_at: string | null;
}

interface ModuleForm {
  title: string;
  description: string;
  is_mandatory_for_new_workers: boolean;
  is_active: boolean;
  mcq_set_id: string;
  task_assessment_id: string;
}

const EMPTY_MODULE_FORM: ModuleForm = {
  title: '',
  description: '',
  is_mandatory_for_new_workers: false,
  is_active: true,
  mcq_set_id: '',
  task_assessment_id: '',
};

interface LessonForm {
  title: string;
  content_type: string;
  content: string;
  media_url: string;
  sort_order: number;
}

const EMPTY_LESSON_FORM: LessonForm = {
  title: '',
  content_type: 'text',
  content: '',
  media_url: '',
  sort_order: 1,
};

const CONTENT_ICON: Record<string, typeof FileText> = {
  text: FileText,
  link: Link2,
  video: PlayCircle,
  pdf: FileText,
};

// ── New Module modal ───────────────────────────────────────────────────────────

function ModuleModal({
  mcqSets,
  tasks,
  onClose,
  onSaved,
}: {
  mcqSets: McqSetOption[];
  tasks: TaskOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ModuleForm>(EMPTY_MODULE_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/training/modules', {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        mcq_set_id: form.mcq_set_id || undefined,
        task_assessment_id: form.task_assessment_id || undefined,
        is_mandatory_for_new_workers: form.is_mandatory_for_new_workers,
        is_active: form.is_active,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create module');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white">New Training Module</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Title</label>
            <input
              required value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Platform Onboarding Basics"
              className="input-field"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Description</label>
            <textarea
              rows={3} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What this module covers…"
              className="input-field resize-none"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Linked MCQ Set (optional)</label>
              <select
                value={form.mcq_set_id}
                onChange={(e) => setForm((f) => ({ ...f, mcq_set_id: e.target.value }))}
                className="input-field"
              >
                <option value="">None</option>
                {mcqSets.map((s) => (
                  <option key={s.id} value={s.id}>{s.title} ({s.question_count} q)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Linked Task (optional)</label>
              <select
                value={form.task_assessment_id}
                onChange={(e) => setForm((f) => ({ ...f, task_assessment_id: e.target.value }))}
                className="input-field"
              >
                <option value="">None</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="flex items-center gap-2.5 text-sm text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_mandatory_for_new_workers}
                  onChange={(e) => setForm((f) => ({ ...f, is_mandatory_for_new_workers: e.target.checked }))}
                  className="accent-emerald-500 w-4 h-4"
                />
                Mandatory for new workers
              </label>
              <p className="text-[11px] text-theme-muted mt-1 ml-6">
                New workers must complete all mandatory modules before an admin clears them to work.
              </p>
            </div>
            <label className="flex items-center gap-2.5 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="accent-emerald-500 w-4 h-4"
              />
              Active (visible to workers)
            </label>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" className="text-white" /> : <Plus size={14} />}
              Create Module
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Lesson form (add or edit) ──────────────────────────────────────────────────

function LessonEditor({
  moduleId,
  lesson,
  defaultSortOrder,
  onDone,
  onCancel,
}: {
  moduleId: string;
  lesson: Lesson | null;
  defaultSortOrder: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<LessonForm>(
    lesson
      ? {
          title: lesson.title,
          content_type: lesson.content_type,
          content: lesson.content ?? '',
          media_url: lesson.media_url ?? '',
          sort_order: lesson.sort_order,
        }
      : { ...EMPTY_LESSON_FORM, sort_order: defaultSortOrder },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsMedia = ['video', 'pdf', 'link'].includes(form.content_type);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        content_type: form.content_type,
        content: form.content_type === 'text' ? form.content : (form.content || undefined),
        media_url: needsMedia ? form.media_url.trim() : undefined,
        sort_order: Number(form.sort_order),
      };
      if (lesson) {
        await api.patch(`/training/lessons/${lesson.id}`, payload);
      } else {
        await api.post('/training/lessons', { module_id: moduleId, ...payload });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lesson');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-emerald-accent/20 bg-emerald-accent/[0.03] p-4 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-accent">
        {lesson ? 'Edit lesson' : 'Add lesson'}
      </p>
      <div className="grid sm:grid-cols-[1fr_140px_90px] gap-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Title</label>
          <input
            required value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Lesson title"
            className="input-field"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Type</label>
          <select
            value={form.content_type}
            onChange={(e) => setForm((f) => ({ ...f, content_type: e.target.value }))}
            className="input-field"
          >
            <option value="text">Text</option>
            <option value="link">Link</option>
            <option value="video">Video</option>
            <option value="pdf">PDF</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Order</label>
          <input
            type="number" min={0} required value={form.sort_order}
            onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
            className="input-field"
          />
        </div>
      </div>

      {form.content_type === 'text' ? (
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Content</label>
          <textarea
            rows={4} required value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="Lesson text content…"
            className="input-field resize-none"
          />
        </div>
      ) : (
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Media URL</label>
          <input
            type="url" required value={form.media_url}
            onChange={(e) => setForm((f) => ({ ...f, media_url: e.target.value }))}
            placeholder="https://…"
            className="input-field"
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-60">
          {saving ? <SpinningDots size="sm" className="text-white" /> : <Check size={12} />}
          {lesson ? 'Save changes' : 'Add lesson'}
        </button>
      </div>
    </form>
  );
}

// ── Module detail (inline panel) ───────────────────────────────────────────────

function ModuleDetail({
  module,
  mcqSets,
  tasks,
  onBack,
  onChanged,
}: {
  module: TrainingModule;
  mcqSets: McqSetOption[];
  tasks: TaskOption[];
  onBack: () => void;
  onChanged: () => void;
}) {
  const lessons = [...(module.lessons ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const [adding, setAdding] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Completion stats — loaded lazily when the panel opens.
  const [progress, setProgress] = useState<ProgressRow[] | null>(null);
  useEffect(() => {
    api.get<ProgressRow[]>(`/training/progress?module_id=${module.id}`)
      .then(setProgress)
      .catch(() => setProgress([]));
  }, [module.id]);

  const completed = progress?.filter((p) => p.status === 'completed').length ?? 0;
  const inProgress = progress?.filter((p) => p.status === 'in_progress').length ?? 0;

  const mcqTitle = module.mcq_set_id ? mcqSets.find((s) => s.id === module.mcq_set_id)?.title : null;
  const taskTitle = module.task_assessment_id ? tasks.find((t) => t.id === module.task_assessment_id)?.title : null;

  async function handleDeleteLesson(lesson: Lesson) {
    if (!window.confirm(`Delete lesson "${lesson.title}"?`)) return;
    setDeletingId(lesson.id);
    setError(null);
    try {
      await api.delete(`/training/lessons/${lesson.id}`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete lesson');
    } finally {
      setDeletingId(null);
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
          {!module.is_active && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-theme-muted border border-white/10">
              Inactive
            </span>
          )}
        </div>
        {module.description && <p className="text-xs text-theme-muted mt-2 whitespace-pre-wrap">{module.description}</p>}

        <div className="flex flex-wrap gap-x-8 gap-y-2 mt-4 pt-4 border-t border-white/[0.06] text-xs">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Completion</p>
            <p className="text-white font-semibold mt-0.5">
              {progress === null
                ? 'Loading…'
                : `${completed} completed · ${inProgress} in progress · ${progress.length} started`}
            </p>
          </div>
          {mcqTitle && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Linked MCQ Set</p>
              <p className="text-gold-accent font-semibold mt-0.5">{mcqTitle}</p>
            </div>
          )}
          {taskTitle && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">Linked Task</p>
              <p className="text-gold-accent font-semibold mt-0.5">{taskTitle}</p>
            </div>
          )}
        </div>
      </div>

      {/* Lessons */}
      <div className="glass-panel rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Lessons ({lessons.length})</h3>
          {!adding && (
            <button
              type="button"
              onClick={() => { setAdding(true); setEditingLessonId(null); }}
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <Plus size={12} /> Add Lesson
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {adding && (
          <LessonEditor
            moduleId={module.id}
            lesson={null}
            defaultSortOrder={(lessons[lessons.length - 1]?.sort_order ?? 0) + 1}
            onDone={() => { setAdding(false); onChanged(); }}
            onCancel={() => setAdding(false)}
          />
        )}

        {lessons.length === 0 && !adding ? (
          <p className="text-xs text-theme-muted py-4 text-center">No lessons yet — add the first one.</p>
        ) : (
          <div className="space-y-2">
            {lessons.map((l) => {
              const Icon = CONTENT_ICON[l.content_type] ?? FileText;
              return editingLessonId === l.id ? (
                <LessonEditor
                  key={l.id}
                  moduleId={module.id}
                  lesson={l}
                  defaultSortOrder={l.sort_order}
                  onDone={() => { setEditingLessonId(null); onChanged(); }}
                  onCancel={() => setEditingLessonId(null)}
                />
              ) : (
                <div
                  key={l.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <span className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/10 text-theme-muted flex items-center justify-center shrink-0 text-[10px] font-bold">
                    {l.sort_order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{l.title}</p>
                    <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-theme-muted mt-0.5">
                      <Icon size={10} /> {l.content_type}
                      {l.media_url && <span className="normal-case tracking-normal truncate ml-1">· {l.media_url}</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditingLessonId(l.id); setAdding(false); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-white border border-white/10 bg-white/[0.03] transition-colors"
                    title="Edit lesson"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLesson(l)}
                    disabled={deletingId === l.id}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-danger border border-white/10 bg-white/[0.03] transition-colors disabled:opacity-50"
                    title="Delete lesson"
                  >
                    {deletingId === l.id ? <SpinningDots size="sm" className="text-danger" /> : <Trash2 size={13} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminTrainingPage() {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [mcqSets, setMcqSets] = useState<McqSetOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadModules = useCallback(async () => {
    try {
      setModules(await api.get<TrainingModule[]>('/training/modules'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load training modules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModules();
    api.get<McqSetOption[]>('/assessments').then(setMcqSets).catch(() => {});
    api.get<TaskOption[]>('/task-assessments').then(setTasks).catch(() => {});
  }, [loadModules]);

  async function handleToggleActive(m: TrainingModule) {
    setTogglingId(m.id);
    try {
      await api.patch(`/training/modules/${m.id}`, { is_active: !m.is_active });
      setModules((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_active: !m.is_active } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update module');
    } finally {
      setTogglingId(null);
    }
  }

  const openModule = modules.find((m) => m.id === openModuleId) ?? null;

  return (
    <div>
      <PageHeader
        title="Training Builder"
        description="Create training modules and lessons, link assessments, and track worker completion."
        actions={
          !openModule ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
            >
              <Plus size={15} /> New Module
            </button>
          ) : undefined
        }
      />
      <AdminSectionTabs tabs={QUALITY_TABS} />

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error && modules.length === 0 ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      ) : openModule ? (
        <ModuleDetail
          module={openModule}
          mcqSets={mcqSets}
          tasks={tasks}
          onBack={() => setOpenModuleId(null)}
          onChanged={loadModules}
        />
      ) : modules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-14 text-center">
          <BookOpen size={22} className="mx-auto text-theme-muted mb-3" />
          <p className="text-sm text-theme-muted">No training modules yet. Create the first one to onboard workers.</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs mb-4">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((m) => {
              const lessonCount = m.lessons?.length ?? 0;
              return (
                <div key={m.id} className="glass-panel rounded-2xl p-6 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-bold text-white">{m.title}</h3>
                    <span className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-theme-muted flex items-center justify-center shrink-0">
                      <GraduationCap size={16} />
                    </span>
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
                    <span className="text-[11px] text-theme-muted">{lessonCount} lesson{lessonCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="mt-auto pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    {/* Active toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleActive(m)}
                      disabled={togglingId === m.id}
                      className="flex items-center gap-2 text-xs font-semibold text-theme-muted hover:text-white transition-colors disabled:opacity-50"
                      title={m.is_active ? 'Deactivate module' : 'Activate module'}
                    >
                      <span className={`relative w-9 h-5 rounded-full transition-colors ${m.is_active ? 'bg-emerald-accent/60' : 'bg-white/10'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${m.is_active ? 'left-[18px]' : 'left-0.5'}`} />
                      </span>
                      {togglingId === m.id ? '…' : m.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenModuleId(m.id)}
                      className="btn-secondary text-xs py-1.5 px-3"
                    >
                      Manage lessons
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showCreate && (
        <ModuleModal
          mcqSets={mcqSets}
          tasks={tasks}
          onClose={() => setShowCreate(false)}
          onSaved={loadModules}
        />
      )}
    </div>
  );
}
