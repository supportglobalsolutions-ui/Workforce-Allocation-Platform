'use client';

import { usePathname } from 'next/navigation';
import PublicShell from './PublicShell';

/** Wraps public routes with top-only navigation; portal routes use their own layout */
export default function RouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const isPortal =
    pathname.startsWith('/worker') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/leadership');

  if (isPortal) return <>{children}</>;
  return <PublicShell>{children}</PublicShell>;
}
