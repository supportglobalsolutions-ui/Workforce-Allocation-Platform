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
    <footer className={`border-t border-theme bg-brand-surface-lowest/60 backdrop-blur-md px-4 py-3 ${className}`}>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-[1600px] mx-auto text-center sm:text-left">
        <p className="text-[11px] text-theme-muted font-medium">
          © <span suppressHydrationWarning>{year}</span> GlobalSolutions. All rights reserved.
        </p>
        <p className="text-[11px] font-mono text-gold-accent/90" suppressHydrationWarning>
          {dayDate && time ? `${dayDate} · ${time}` : '—'}
        </p>
      </div>
    </footer>
  );
}
