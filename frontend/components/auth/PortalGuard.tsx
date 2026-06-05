'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SpinningDots from '@/components/shared/SpinningDots';
import { useAuth } from '@/lib/auth/AuthProvider';
import { PortalRole, ROLE_LANDING } from '@/lib/navigation/config';

export default function PortalGuard({
  children,
  requiredPortal,
}: {
  children: React.ReactNode;
  requiredPortal: PortalRole;
}) {
  const { session, isLoading, canAccess } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (!canAccess(requiredPortal)) {
      router.replace(ROLE_LANDING[session.primaryPortal]);
    }
  }, [session, isLoading, canAccess, requiredPortal, router]);

  if (isLoading || !session || !canAccess(requiredPortal)) {
    return (
      <div className="min-h-screen bg-brand-background flex items-center justify-center">
        <SpinningDots size="lg" className="text-emerald-accent" />
      </div>
    );
  }

  return <>{children}</>;
}
