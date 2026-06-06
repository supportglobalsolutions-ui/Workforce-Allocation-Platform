'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { PortalRole, ROLE_LANDING } from '@/lib/navigation/config';

export default function PortalGuard({
  children,
  requiredPortal,
}: {
  children: React.ReactNode;
  requiredPortal: PortalRole;
}) {
  const { session, canAccess } = useAuth();
  const router = useRouter();
  const redirecting = useRef(false);

  const allowed = session && canAccess(requiredPortal);

  useEffect(() => {
    if (allowed || redirecting.current) return;

    redirecting.current = true;
    if (!session) {
      router.replace('/login');
      return;
    }
    router.replace(ROLE_LANDING[session.primaryPortal]);
  }, [allowed, session, router, requiredPortal]);

  if (!allowed) return null;

  return <>{children}</>;
}
