'use client';

import { useEffect } from 'react';
import { FlaskConical } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { disableTestMode, leaveTestMode, readTestModeUid, subscribeTestMode, useTestModeUid } from '@/lib/testMode';

/** Marks every page while test mode is on and drops the flag for anyone it doesn't belong to. */
export default function TestModeBanner() {
  const { session, isLoading } = useAuth();
  const uid = useTestModeUid();
  const active = !!uid && !!session && session.uid === uid && (session.authRole === 'admin' || session.authRole === 'super_admin');

  useEffect(() => {
    if (uid && !isLoading && session && !active) disableTestMode();
  }, [uid, isLoading, session, active]);

  // Turning test mode on/off in another tab must not leave this tab showing data
  // fetched under the other mode (e.g. real clients with TEST badges) — reload it.
  // Listen for real changes only (not render values, which read null during hydration).
  useEffect(() => {
    const initial = readTestModeUid();
    return subscribeTestMode(() => {
      if (readTestModeUid() !== initial) window.location.reload();
    });
  }, []);

  useEffect(() => {
    document.body.classList.toggle('test-mode', active);
    return () => document.body.classList.remove('test-mode');
  }, [active]);

  if (!active) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-[120] flex items-center gap-3 rounded-full border border-amber-400/60 bg-amber-400/95 px-4 py-2 text-xs font-bold text-black shadow-lg"
    >
      <FlaskConical size={14} />
      <span>TEST MODE — only test data; nothing reaches real people</span>
      <button
        type="button"
        onClick={leaveTestMode}
        className="rounded-full bg-black/80 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300 hover:bg-black"
      >
        Turn off
      </button>
    </div>
  );
}
