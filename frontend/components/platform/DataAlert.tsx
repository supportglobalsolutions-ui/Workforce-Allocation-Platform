'use client';

import type { ReactNode } from 'react';
import { AlertCircle, Info } from 'lucide-react';

type Tone = 'info' | 'warning' | 'error';

const STYLES: Record<Tone, string> = {
  info: 'border-theme bg-brand-surface-low text-theme-muted',
  warning: 'border-gold-accent/30 bg-gold-accent/10 text-gold-accent',
  error: 'border-danger/30 bg-danger/10 text-danger',
};

/** Banner when a dashboard chart/KPI has no data or a load failed. */
export default function DataAlert({
  tone = 'info',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  const Icon = tone === 'error' ? AlertCircle : Info;
  return (
    <div className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${STYLES[tone]}`}>
      <Icon size={14} className="shrink-0 mt-0.5" />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}
