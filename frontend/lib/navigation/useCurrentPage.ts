'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { PAGES, PageEntry } from '@/lib/pages-registry';
import { detectRoleFromPath, isPortalPath, PortalRole } from './config';

export function getPageFromPath(pathname: string): PageEntry | undefined {
  const exact = PAGES.find((p) => p.href === pathname);
  if (exact) return exact;

  const prefixMatches = PAGES.filter(
    (p) => p.href !== '/' && (pathname === p.href || pathname.startsWith(p.href + '/'))
  ).sort((a, b) => b.href.length - a.href.length);

  return prefixMatches[0];
}

export function useCurrentPage() {
  const pathname = usePathname() ?? '/';

  return useMemo(() => {
    const page = getPageFromPath(pathname);
    const isPortal = isPortalPath(pathname);
    const role = isPortal ? detectRoleFromPath(pathname) : null;

    return {
      pathname,
      page,
      title: page?.title ?? 'GlobalSolutions',
      isPortal,
      role: role as PortalRole | null,
    };
  }, [pathname]);
}
