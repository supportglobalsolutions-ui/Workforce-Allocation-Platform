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

  const seconds = Math.ceil(remaining / 1000);
  const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const warning = remaining <= IDLE_WARNING_MS;
  return (
    <div className={`fixed bottom-4 right-4 z-[100] rounded-xl border px-4 py-3 shadow-lg bg-brand-card ${warning ? 'border-gold-accent' : 'border-theme'}`}>
      <p className="text-xs text-theme-muted">Inactivity sign-out <span className="font-mono font-bold text-theme-heading">{countdown}</span></p>
      {warning && (
        <div role="alert" className="mt-2">
          <p className="text-sm text-theme-heading">Your session is about to expire.</p>
          <button type="button" className="mt-2 text-sm font-bold text-emerald-accent" onClick={() => {
            const last = readActivity(uid) ?? 0;
            if (remainingIdleMs(last) === 0) { onExpire(); return; }
            writeActivity(uid);
            setRemaining(IDLE_TIMEOUT_MS);
          }}>Stay signed in</button>
        </div>
      )}
    </div>
  );
}
