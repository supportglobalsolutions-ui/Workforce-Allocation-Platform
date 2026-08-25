'use client';

import TopNav from './TopNav';
import SiteFooter from '@/components/layout/SiteFooter';

/** Public pages with top nav — e.g. /pages directory */
export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-background text-brand-on-surface flex flex-col font-sans overflow-x-clip">
      <TopNav variant="public" />
      <div className="flex-1 relative w-full min-w-0 px-4 sm:px-6 md:px-8">{children}</div>
      <SiteFooter />
    </div>
  );
}
