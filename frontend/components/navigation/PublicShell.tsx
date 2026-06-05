'use client';

import TopNav from './TopNav';
import SiteFooter from '@/components/layout/SiteFooter';

/** Public pages with top nav — e.g. /pages directory */
export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-background text-brand-on-surface flex flex-col font-sans">
      <TopNav variant="public" />
      <div className="flex-1 relative">{children}</div>
      <SiteFooter />
    </div>
  );
}
