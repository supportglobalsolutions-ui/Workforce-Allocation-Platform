'use client';

import { useState, useEffect } from 'react';

export default function SiteFooter({ className = '' }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const year = now?.getFullYear() ?? new Date().getFullYear();
  const dayDate = now?.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) ?? '';
  const time = now?.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) ?? '';

  return (
    <footer className={`px-5 sm:px-8 py-5 ${className}`}>
      <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
        <p className="text-sm sm:text-base font-semibold font-display text-theme-heading tracking-tight">
          © <span suppressHydrationWarning>{year}</span>{' '}
          <span className="text-emerald-accent">Global Solutions</span>
          <span className="text-theme-muted font-normal">. All rights reserved.</span>
        </p>

        <div
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm sm:text-base font-mono tabular-nums"
          suppressHydrationWarning
        >
          {dayDate && time ? (
            <>
              <span className="text-theme-body font-medium">{dayDate}</span>
              <span className="text-gold-accent font-bold" aria-hidden>
                ·
              </span>
              <span className="text-gold-accent font-semibold text-glow-gold">{time}</span>
            </>
          ) : (
            <span className="text-theme-muted">—</span>
          )}
        </div>
      </div>
    </footer>
  );
}
