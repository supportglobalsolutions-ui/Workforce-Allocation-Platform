'use client';

import Link from 'next/link';
import { AlertCircle, Home, LifeBuoy, RefreshCw, X } from 'lucide-react';

type ErrorToastProps = {
  message: string;
  onDismiss: () => void;
  retryLabel?: string;
  showRetry?: boolean;
  title?: string;
  linkHref?: string;
  linkLabel?: string;
};

/** A safe, user-facing fallback for expected request failures. */
export default function ErrorToast({
  message,
  onDismiss,
  retryLabel = 'Refresh',
  showRetry = true,
  title = 'We need your attention',
  linkHref = '/',
  linkLabel = 'Home',
}: ErrorToastProps) {
  if (!message) return null;

  const LinkIcon = linkHref === '/contact' ? LifeBuoy : Home;

  return (
    <div role="alert" aria-live="assertive" className="fixed inset-x-4 bottom-4 z-[100] mx-auto w-auto max-w-md rounded-2xl border border-red-400/35 bg-[#10251f]/95 p-4 text-white shadow-2xl backdrop-blur-xl sm:left-auto sm:right-6 sm:w-[26rem]">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 shrink-0 text-red-300" size={19} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[#d2e4de]">{message}</p>
          <div className="mt-3 flex items-center gap-3 text-xs font-semibold">
            {showRetry && (
              <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1 text-[#0df5c4] hover:underline">
                <RefreshCw size={13} /> {retryLabel}
              </button>
            )}
            <Link href={linkHref} className="inline-flex items-center gap-1 text-[#d4af37] hover:underline">
              <LinkIcon size={13} /> {linkLabel}
            </Link>
          </div>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss error" className="shrink-0 text-[#98b7af] hover:text-white">
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
