'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppShell from '@/components/navigation/AppShell';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { hasCompletePayoutDetails } from '@/lib/mobile-money-fields';

export default function WorkerShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
        // Payout fields are edited on Profile — allow that page, otherwise send there.
        if (!hasCompletePayoutDetails(w)) {
          const onProfile = pathname === '/worker/profile' || pathname?.startsWith('/worker/profile/');
          if (!onProfile) {
            router.replace('/worker/profile?complete=payout');
            return;
          }
        }
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
  }, [router, pathname]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-brand-background flex items-center justify-center">
        <SpinningDots size="lg" className="text-emerald-accent" />
      </div>
    );
  }

  return <AppShell role="worker">{children}</AppShell>;
}
