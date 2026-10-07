'use client';

import { useEffect, useState } from 'react';
import { activityKey, IDLE_TIMEOUT_MS, IDLE_WARNING_MS, readActivity, remainingIdleMs, writeActivity } from '@/lib/auth/inactivity';

export default function SessionInactivity({ uid, onExpire }: { uid: string; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(IDLE_TIMEOUT_MS);

  useEffect(() => {
    let expired = false;
    const check = () => {
      if (expired) return 0;
      const time = remainingIdleMs(readActivity(uid) ?? 0);
      setRemaining(time);
      if (time === 0) {
        expired = true;
        writeActivity(uid, 0);
        onExpire();
      }
      return time;
    };
    const activity = (event: Event) => {
      if (!event.isTrusted || document.visibilityState !== 'visible' || check() === 0) return;
      const last = readActivity(uid) ?? 0;
      // Limit writes during mouse movement while sharing activity across tabs.
      if (Date.now() - last >= 1000) writeActivity(uid);
      check();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === activityKey(uid)) check();
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, activity, { passive: true, capture: true }));
    window.addEventListener('storage', storage);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    check();
    const timer = window.setInterval(check, 1000);
    return () => {
      window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, activity, true));
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [uid, onExpire]);

  if (remaining > IDLE_WARNING_MS || remaining <= 0) return null;

  const seconds = Math.ceil(remaining / 1000);
  const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-xl border border-gold-accent px-4 py-3 shadow-lg bg-brand-card" role="alert">
      <p className="text-sm font-semibold text-theme-heading">Are you still there?</p>
      <p className="mt-1 text-sm text-theme-muted">You’ll be signed out in <span className="font-mono font-bold text-theme-heading">{countdown}</span> due to inactivity. Continue using the app or choose Stay signed in.</p>
      <button type="button" className="mt-2 text-sm font-bold text-emerald-accent" onClick={() => {
        const last = readActivity(uid) ?? 0;
        if (remainingIdleMs(last) === 0) { onExpire(); return; }
        writeActivity(uid);
        setRemaining(IDLE_TIMEOUT_MS);
      }}>Stay signed in</button>
    </div>
  );
}
