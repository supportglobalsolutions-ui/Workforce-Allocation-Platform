'use client';

import TopNav from './TopNav';

/** Public pages — top navigation only, no sidebar */
export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-background text-brand-on-surface flex flex-col font-sans">
      <TopNav variant="public" />
      <div className="flex-1 relative">{children}</div>
    </div>
  );
}
