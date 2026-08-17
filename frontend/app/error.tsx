'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, Home, RotateCcw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-panel rounded-2xl border border-danger/20 p-8 max-w-lg w-full text-center">
        <div className="w-12 h-12 rounded-xl bg-danger/10 text-danger flex items-center justify-center mx-auto">
          <AlertCircle size={22} />
        </div>
        <h1 className="mt-4 text-lg font-bold text-theme-heading">Something went wrong</h1>
        <p className="mt-2 text-sm text-theme-muted">
          This page hit an unexpected error. Trying again usually clears it.
        </p>
        {error.message && (
          <p className="mt-4 text-xs text-theme-muted font-mono break-words rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left">
            {error.message}
          </p>
        )}
        {error.digest && (
          <p className="mt-2 text-[11px] text-theme-muted">Reference: {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
            <RotateCcw size={14} /> Try again
          </button>
          <Link href="/" className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
            <Home size={14} /> Home
          </Link>
        </div>
      </div>
    </div>
  );
}
