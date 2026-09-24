'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';

import ConfirmModal from '@/components/platform/ConfirmModal';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { QUALITY_TABS } from '@/components/platform/AdminSectionTabs';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

interface LedgerRow {
  kind: 'mcq' | 'task';
  result_id: string;
  source_id: string;
  title: string;
  worker_id: string;
  worker_display_name: string;
  worker_country: string;
  score_pct: number | null;
  passed: boolean | null;
  completed_at: string | null;
}

interface WorkerRow {
  id: string;
  display_name: string;
  country?: string;
  status: string;
}

interface Sitting {
  key: string;
  title: string;
  kind: 'mcq' | 'task';
  source_id: string;
}

export default function AssessmentTestsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><SpinningDots size="lg" /></div>}>
      <TestsBody />
    </Suspense>
  );
}

function TestsBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sitting = searchParams.get('test') || '';

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [mcq, setMcq] = useState<{ id: string; title: string }[]>([]);
  const [tasks, setTasks] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editScore, setEditScore] = useState('');
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Sitting | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<LedgerRow[]>('/assessments/grade-ledger'),
      api.get<WorkerRow[]>('/workers'),
      api.get<{ id: string; title: string }[]>('/assessments').catch(() => []),
      api.get<{ id: string; title: string }[]>('/task-assessments').catch(() => []),
    ])
      .then(([ledger, people, sets, taskList]) => {
        setRows(ledger);
        setWorkers(people);
        setMcq(sets);
        setTasks(taskList);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load tests.'))
      .finally(() => setLoading(false));
  }, []);

  // Only live assessments — never rehydrate cards from orphan ledger rows
  // left after an MCQ/task was deleted (source_id survives SET NULL).
  const sittings = useMemo(() => {
    const list: Sitting[] = [
      ...mcq.map((s) => ({ key: `mcq:${s.id}`, title: s.title, kind: 'mcq' as const, source_id: s.id })),
      ...tasks.map((t) => ({ key: `task:${t.id}`, title: t.title, kind: 'task' as const, source_id: t.id })),
    ];
    return list.sort((a, b) => a.title.localeCompare(b.title));
  }, [mcq, tasks]);

  const selected = sittings.find((s) => s.key === sitting) ?? null;
  const results = useMemo(
    () => rows.filter((r) => `${r.kind}:${r.source_id}` === sitting).sort((a, b) => (b.score_pct ?? -1) - (a.score_pct ?? -1)),
    [rows, sitting],
  );
  const doneIds = new Set(results.map((r) => r.worker_id));
  const missing = workers.filter((w) => w.status === 'active' && !doneIds.has(w.id));

  async function saveScore(row: LedgerRow) {
    setSaving(true);
    try {
      const path = row.kind === 'mcq'
        ? `/assessments/results/${row.result_id}/score`
        : `/task-assessments/results/${row.result_id}/score`;
      await api.patch(path, { score_pct: Number(editScore) });
      setRows((prev) => prev.map((r) => (
        r.result_id === row.result_id ? { ...r, score_pct: Number(editScore) } : r
      )));
      setEditId(null);
    } catch {
      /* keep editor open */
    } finally {
      setSaving(false);
    }
  }

  /** Open the sitting's scores here. */
  function openTest(s: Sitting) {
    router.push(`/admin/assessments/scores/tests?test=${encodeURIComponent(s.key)}`);
  }

  /** Hand off to the Assessment Builder, which owns the editing UI. */
  function editTest(s: Sitting) {
    const param = s.kind === 'mcq' ? 'mcq' : 'task';
    router.push(`/admin/assessments?${param}=${encodeURIComponent(s.source_id)}`);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const path = toDelete.kind === 'mcq'
        ? `/assessments/${toDelete.source_id}`
        : `/task-assessments/${toDelete.source_id}`;
      await api.delete(path);
      if (toDelete.kind === 'mcq') {
        setMcq((prev) => prev.filter((s) => s.id !== toDelete.source_id));
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== toDelete.source_id));
      }
      if (sitting === toDelete.key) {
        router.push('/admin/assessments/scores/tests');
      }
      setToDelete(null);
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tests"
        description="Every live MCQ and task sitting. Create new ones on Assessments."
        actions={
          <Link
            href="/admin/assessments"
            className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2"
          >
            <Plus size={15} />
            Add assessment
          </Link>
        }
      />
      <AdminSectionTabs tabs={QUALITY_TABS} />

      {deleteError && (
        <p className="mb-3 text-sm text-danger">{deleteError}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" /></div>
      ) : error ? (
        <p className="text-danger text-sm">{error}</p>
      ) : !selected ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {sittings.map((s) => {
            const n = rows.filter((r) => `${r.kind}:${r.source_id}` === s.key).length;
            return (
              <div
                key={s.key}
                className="glass-panel rounded-2xl border border-white/5 p-4 flex items-start gap-3 hover:border-emerald-accent/30"
              >
                <button
                  type="button"
                  onClick={() => openTest(s)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-semibold text-white">{s.title}</p>
                  <p className="text-xs text-theme-muted mt-1 uppercase">{s.kind} · {n} scored</p>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Opens the sitting on this page — scores, who has sat it,
                      who has not. */}
                  <button
                    type="button"
                    title={`View ${s.title}`}
                    aria-label={`View ${s.title}`}
                    onClick={() => openTest(s)}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-theme-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <Eye size={15} />
                  </button>
                  {/* Hands off to the Assessment Builder's own editor rather
                      than growing a second one here. */}
                  <button
                    type="button"
                    title={`Edit ${s.title}`}
                    aria-label={`Edit ${s.title}`}
                    onClick={() => editTest(s)}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-emerald-accent/25 bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20 transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    title={`Delete ${s.title}`}
                    aria-label={`Delete ${s.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteError('');
                      setToDelete(s);
                    }}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-danger/25 bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
          {sittings.length === 0 && (
            <div className="sm:col-span-2 glass-panel rounded-2xl border border-dashed border-white/10 p-8 text-center space-y-3">
              <p className="text-sm text-theme-muted">No live tests yet.</p>
              <Link href="/admin/assessments" className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2">
                <Plus size={15} />
                Add assessment
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push('/admin/assessments/scores/tests')}
              className="text-xs text-theme-muted hover:text-white"
            >
              ← All tests
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => editTest(selected)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-accent/25 bg-emerald-accent/10 px-3 py-1.5 text-xs font-semibold text-emerald-accent hover:bg-emerald-accent/20"
              >
                <Pencil size={13} />
                Edit test
              </button>
              <button
                type="button"
                onClick={() => { setDeleteError(''); setToDelete(selected); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-danger/25 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/20"
              >
                <Trash2 size={13} />
                Delete test
              </button>
            </div>
          </div>
          <h2 className="text-lg font-bold text-white mb-1">{selected.title}</h2>
          <p className="text-xs text-theme-muted mb-4">
            {results.length} of {workers.filter((w) => w.status === 'active').length} active workers have a score
          </p>
          <div className="glass-panel rounded-2xl border border-white/5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-theme-muted">
                  <th className="text-left px-4 py-3">Rank</th>
                  <th className="text-left px-4 py-3">Worker</th>
                  <th className="text-right px-4 py-3">Score</th>
                  <th className="text-left px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={`${r.kind}-${r.result_id}`} className="border-b border-white/[0.04]">
                    <td className="px-4 py-2 text-theme-muted">#{i + 1}</td>
                    <td className="px-4 py-2 text-white">
                      {r.worker_display_name}
                      <span className="block text-[11px] text-theme-muted">{r.worker_country}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editId === r.result_id ? (
                        <span className="inline-flex gap-1">
                          <input className="input-field w-20 text-right" value={editScore}
                            onChange={(e) => setEditScore(e.target.value)} />
                          <button type="button" disabled={saving} className="text-xs text-emerald-accent" onClick={() => void saveScore(r)}>Save</button>
                        </span>
                      ) : (
                        <button type="button" className="text-emerald-accent font-semibold tabular-nums"
                          onClick={() => { setEditId(r.result_id); setEditScore(String(r.score_pct ?? '')); }}>
                          {r.score_pct != null ? Number(r.score_pct).toFixed(1) : '—'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 text-theme-muted text-xs">
                      {r.completed_at ? new Date(r.completed_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length === 0 && <p className="p-6 text-sm text-theme-muted">Nobody has this score yet.</p>}
          </div>
          {missing.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase text-theme-muted mb-2">Not done</h3>
              <ul className="text-sm text-white space-y-1">
                {missing.map((w) => <li key={w.id}>{w.display_name}</li>)}
              </ul>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={!!toDelete}
        title={toDelete?.kind === 'task' ? 'Delete this task assessment?' : 'Delete this assessment?'}
        body={
          toDelete ? (
            <>
              Permanently delete{' '}
              <span className="font-semibold text-theme-heading">{toDelete.title}</span>
              {toDelete.kind === 'mcq'
                ? ' and its questions. It will leave this Tests list immediately.'
                : ', its activities, and media. It will leave this Tests list immediately.'}
            </>
          ) : null
        }
        confirmLabel="Delete"
        tone="danger"
        icon={Trash2}
        busy={deleting}
        onCancel={() => { if (!deleting) setToDelete(null); }}
        onConfirm={() => { void confirmDelete(); }}
      />
    </div>
  );
}
