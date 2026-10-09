'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, FlaskConical, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { api } from '@/lib/api';
import { readActingWorker, setActingWorker, useTestModeUid } from '@/lib/testMode';

interface WorkerOption { id: string; display_name: string; status?: string }

/**
 * Test mode, worker portal: lets an admin view the portal as any worker in the
 * test copy. Hidden outside test mode; the backend ignores the choice there too.
 */
export default function TestWorkerSwitcher() {
  const { session } = useAuth();
  const testUid = useTestModeUid();
  const isAdmin = session?.authRole === 'admin' || session?.authRole === 'super_admin';
  const active = !!testUid && !!session && testUid === session.uid && isAdmin;
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [current, setCurrent] = useState<string>('');

  useEffect(() => {
    if (!active) return;
    setCurrent(readActingWorker()?.id ?? '');
    api.getAsAdmin<WorkerOption[]>('/workers')
      .then((rows) => setWorkers(rows.filter((w) => (w.status ?? 'active') === 'active')))
      .catch(() => setWorkers([]));
  }, [active]);

  // The choice is shared by every tab: when it changes elsewhere, reload here too
  // so this tab never shows the previous worker's (or the admin's own) data.
  useEffect(() => {
    if (!active) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'gs-test-act-as') window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [active]);

  if (!active) return null;

  const choose = (id: string) => {
    const w = workers.find((x) => x.id === id);
    setActingWorker(w ? { id: w.id, name: w.display_name } : null);
    // Every page reloads its data as the chosen worker.
    window.location.reload();
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-2.5 text-sm">
      <span className="inline-flex items-center gap-1.5 font-bold text-amber-400">
        <FlaskConical size={15} /> TEST
      </span>
      <label htmlFor="test-worker-switch" className="text-theme-muted">Viewing the worker portal as</label>
      <div className="flex items-center gap-1.5">
        <UserRound size={14} className="text-amber-400" />
        <select
          id="test-worker-switch"
          value={current}
          onChange={(e) => choose(e.target.value)}
          className="rounded-lg border border-amber-400/40 bg-brand-surface-high px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-400"
        >
          <option value="">Myself (admin)</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.display_name}</option>
          ))}
        </select>
      </div>
      <Link
        href={current ? `/admin/workers?worker=${current}` : '/admin/workers'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-400/10"
      >
        <ArrowLeft size={13} /> {current ? 'Worker details in admin' : 'Back to admin'}
      </Link>
      <span className="text-xs text-theme-muted">Test data only — real workers are never shown here.</span>
    </div>
  );
}
