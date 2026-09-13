'use client';

import { useEffect, useState } from 'react';

/** Live local date + time, updates every second. */
export default function LiveDateTime({ className = '' }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!now) {
    return (
      <div className={`tabular-nums ${className}`} aria-hidden>
        ——————
      </div>
    );
  }

  const date = now.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const time = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className={`tabular-nums ${className}`} suppressHydrationWarning>
      <span>{date}</span>
      <span className="mx-1.5 opacity-40">•</span>
      <span>{time}</span>
    </div>
  );
}
