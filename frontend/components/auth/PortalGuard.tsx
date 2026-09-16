'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { PortalRole, ROLE_LANDING } from '@/lib/navigation/config';
import SpinningDots from '@/components/shared/SpinningDots';

export default function PortalGuard({
  children,
  requiredPortal,
}: {
  children: React.ReactNode;
  requiredPortal: PortalRole;
}) {
  const { session, isLoading, canAccess } = useAuth();
  const router = useRouter();
  const redirecting = useRef(false);

  const allowed = Boolean(session && canAccess(requiredPortal));

  useEffect(() => {
    if (isLoading || allowed || redirecting.current) return;

    redirecting.current = true;
    if (!session) {
      router.replace('/login');
      return;
    }
    router.replace(ROLE_LANDING[session.primaryPortal]);
  }, [isLoading, allowed, session, router]);

  // Never paint an empty viewport. `return null` used to leave only the root
  // brand background — which looks like a broken app during auth resolve or
  // portal redirect.
  if (isLoading || !allowed) {
    return (
      <div className="min-h-screen bg-brand-background flex items-center justify-center">
        <SpinningDots size="lg" className="text-emerald-accent" />
      </div>
    );
  }

  return <>{children}</>;
}
