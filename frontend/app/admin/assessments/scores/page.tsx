'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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

function average(scores: number[]): number | null {
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export default function AssessmentScoresPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<LedgerRow[]>('/assessments/grade-ledger'),
      api.get<WorkerRow[]>('/workers'),
    ])
      .then(([ledger, people]) => {
        setRows(ledger);
        setWorkers(people);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load scores.'))
      .finally(() => setLoading(false));
  }, []);

  const people = useMemo(() => {
    const testsByWorker = new Map<string, LedgerRow[]>();
    for (const r of rows) {
      const list = testsByWorker.get(r.worker_id) ?? [];
      list.push(r);
      testsByWorker.set(r.worker_id, list);
    }
    return workers
      .filter((w) => w.status === 'active')
      .map((w) => {
        const tests = (testsByWorker.get(w.id) ?? []).slice().sort((a, b) => a.title.localeCompare(b.title));
        const avg = average(tests.map((t) => t.score_pct).filter((n): n is number => n != null));
        return { worker: w, tests, avg };
      })
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  }, [rows, workers]);

  return (
    <div>
      <PageHeader
        title="Assessment scores"
      />
      <AdminSectionTabs tabs={QUALITY_TABS} />

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" /></div>
      ) : error ? (
        <p className="text-danger text-sm">{error}</p>
      ) : (
        <div className="space-y-3">
          {people.map(({ worker, tests, avg }, i) => (
            <section key={worker.id} className="glass-panel rounded-2xl border border-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    <span className="text-theme-muted font-normal mr-2">#{i + 1}</span>
                    {worker.display_name}
                  </p>
                  <p className="text-xs text-theme-muted">{worker.country || 'Unassigned'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-accent tabular-nums">
                    {avg != null ? `${avg.toFixed(1)} / 100` : 'No tests'}
                  </p>
                  <p className="text-[11px] text-theme-muted">
                    {tests.length} {tests.length === 1 ? 'test' : 'tests'}
                  </p>
                </div>
              </div>
              {tests.length === 0 ? (
                <p className="text-xs text-theme-muted">No tests taken yet.</p>
              ) : (
                <ul className="divide-y divide-white/[0.04]">
                  {tests.map((t) => (
                    <li key={`${t.kind}-${t.result_id}`} className="flex items-center justify-between gap-3 py-2">
                      <Link
                        href={`/admin/assessments/scores/tests?test=${encodeURIComponent(`${t.kind}:${t.source_id}`)}`}
                        className="text-sm text-theme-heading hover:text-emerald-accent"
                      >
                        {t.title}
                        <span className="ml-2 text-[10px] uppercase text-theme-muted">{t.kind}</span>
                      </Link>
                      <span className="text-sm font-semibold tabular-nums text-white">
                        {t.score_pct != null ? Number(t.score_pct).toFixed(1) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {people.length === 0 && <p className="p-6 text-sm text-theme-muted">No workers yet.</p>}
        </div>
      )}
    </div>
  );
}
