'use client';

import ThemeToggle from '@/components/theme/ThemeToggle';
import SiteFooter from '@/components/layout/SiteFooter';

/** Minimal shell — no navigation, theme toggle top-right, footer at bottom */
export default function BareShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-brand-background relative overflow-hidden">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle variant="icon" />
      </div>
      <div className="flex-1 flex flex-col">{children}</div>
      <SiteFooter />
    </div>
  );
}
