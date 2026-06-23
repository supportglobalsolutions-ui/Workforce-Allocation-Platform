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

  const allowed = session && canAccess(requiredPortal);

  useEffect(() => {
    if (isLoading || allowed || redirecting.current) return;

    redirecting.current = true;
    if (!session) {
      router.replace('/login');
      return;
    }
    router.replace(ROLE_LANDING[session.primaryPortal]);
  }, [isLoading, allowed, session, router]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <SpinningDots size="lg" className="text-emerald-accent" />
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}
