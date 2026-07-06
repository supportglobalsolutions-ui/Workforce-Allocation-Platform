'use client';

import PortalGuard from '@/components/auth/PortalGuard';

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return <PortalGuard requiredPortal="worker">{children}</PortalGuard>;
}
