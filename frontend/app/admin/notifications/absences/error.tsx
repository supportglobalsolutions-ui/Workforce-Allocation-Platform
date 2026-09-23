'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function AbsenceReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep diagnostic detail in the console while presenting a safe recovery
    // path to the operations user.
    console.error('Absence reports page failed to render', error);
  }, [error]);

  return (
    <div className="min-h-[420px] flex items-center justify-center">
      <div className="glass-panel max-w-lg rounded-2xl border border-danger/20 p-7 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <AlertCircle size={22} />
        </span>
        <h1 className="mt-4 text-lg font-bold text-theme-heading">Unable to open absence reports</h1>
        <p className="mt-2 text-sm leading-relaxed text-theme-muted">
          The reports could not be displayed just now. Your data has not been changed.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            <RefreshCw size={14} /> Try again
          </button>
          <Link href="/admin/notifications" className="btn-secondary px-4 py-2 text-sm">
            Back to notifications
          </Link>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-theme-muted">Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
