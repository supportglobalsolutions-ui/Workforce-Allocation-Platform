'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/navigation/AppShell';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

export default function WorkerShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const failSafe = window.setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 8_000);

    api.get<{
      username: string | null;
      phone?: string | null;
      mobile_money_name?: string | null;
      mobile_money_provider?: string | null;
    }>('/workers/me')
      .then((w) => {
        if (cancelled) return;
        if (!w.username) {
          router.replace('/worker/setup-username');
          return;
        }
        // Missing phone or payout details must never trap someone on Profile.
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true); // fail open — auth/network error shouldn't soft-lock the app
      })
      .finally(() => window.clearTimeout(failSafe));

    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-brand-background flex items-center justify-center">
        <SpinningDots size="lg" className="text-emerald-accent" />
      </div>
    );
  }

  return <AppShell role="worker">{children}</AppShell>;
}
