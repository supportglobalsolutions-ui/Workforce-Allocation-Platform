'use client';

import { useEffect } from 'react';

const RELOAD_AT_KEY = 'wap_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 20_000;

function shouldRecover(message: string): boolean {
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|\/_next\/static\//i.test(
    message,
  );
}

function hardReloadOnce(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
  } catch {
    /* still reload */
  }
  // Cache-bust so a stale HTML shell cannot keep pointing at deleted chunks.
  const url = new URL(window.location.href);
  url.searchParams.set('_wap_r', String(Date.now()));
  window.location.replace(url.toString());
}

/**
 * When Next.js (or the browser) keeps an HTML shell that references deleted
 * `/_next/static/...` files — common after a hot reload or deploy — pages hang
 * on the loading spinner forever. Detect that and force one clean reload.
 */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const target = event.target;
      if (target instanceof HTMLScriptElement && target.src.includes('/_next/static/')) {
        hardReloadOnce();
        return;
      }
      if (target instanceof HTMLLinkElement && target.href.includes('/_next/static/')) {
        hardReloadOnce();
        return;
      }
      if (shouldRecover(event.message || '')) hardReloadOnce();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? `${reason.name} ${reason.message}`
          : String(reason ?? '');
      if (shouldRecover(message)) hardReloadOnce();
    };

    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
