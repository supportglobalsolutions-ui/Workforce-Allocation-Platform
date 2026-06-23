'use client';

import { usePathname } from 'next/navigation';
import PublicShell from './PublicShell';
import BareShell from './BareShell';

const BARE_PATHS = ['/', '/login', '/signup', '/reset-password'];

export default function RouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const isPortal =
    pathname.startsWith('/worker') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/leadership');

  if (isPortal) return <>{children}</>;
  if (BARE_PATHS.includes(pathname)) return <BareShell>{children}</BareShell>;
  return <PublicShell>{children}</PublicShell>;
}
