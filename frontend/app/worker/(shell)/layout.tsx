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
    api.get<{ username: string | null }>('/workers/me')
      .then((w) => {
        if (!w.username) {
          router.replace('/worker/setup-username');
        } else {
          setReady(true);
        }
      })
      .catch(() => setReady(true)); // fail open — auth/network error shouldn't soft-lock the app
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
