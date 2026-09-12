'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

  const sittings = useMemo(() => {
    const map = new Map<string, Sitting>();
    for (const s of mcq) map.set(`mcq:${s.id}`, { key: `mcq:${s.id}`, title: s.title, kind: 'mcq', source_id: s.id });
    for (const t of tasks) map.set(`task:${t.id}`, { key: `task:${t.id}`, title: t.title, kind: 'task', source_id: t.id });
    for (const r of rows) {
      const key = `${r.kind}:${r.source_id}`;
      if (!map.has(key)) map.set(key, { key, title: r.title, kind: r.kind, source_id: r.source_id });
    }
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [rows, mcq, tasks]);

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

  return (
    <div>
      <PageHeader
        title="Tests"
      />
      <AdminSectionTabs tabs={QUALITY_TABS} />

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" /></div>
      ) : error ? (
        <p className="text-danger text-sm">{error}</p>
      ) : !selected ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {sittings.map((s) => {
            const n = rows.filter((r) => `${r.kind}:${r.source_id}` === s.key).length;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => router.push(`/admin/assessments/scores/tests?test=${encodeURIComponent(s.key)}`)}
                className="glass-panel rounded-2xl border border-white/5 p-4 text-left hover:border-emerald-accent/30"
              >
                <p className="text-sm font-semibold text-white">{s.title}</p>
                <p className="text-xs text-theme-muted mt-1 uppercase">{s.kind} · {n} scored</p>
              </button>
            );
          })}
          {sittings.length === 0 && <p className="p-6 text-sm text-theme-muted">No tests yet.</p>}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => router.push('/admin/assessments/scores/tests')}
            className="text-xs text-theme-muted hover:text-white mb-4"
          >
            ← All tests
          </button>
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
    </div>
  );
}
