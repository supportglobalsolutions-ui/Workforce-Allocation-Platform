'use client';

import { usePathname } from 'next/navigation';
import ThemeToggle from '@/components/theme/ThemeToggle';
import SiteFooter from '@/components/layout/SiteFooter';

/** Minimal shell — no navigation, theme toggle top-right, footer at bottom */
export default function BareShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCinematic = pathname === '/' || pathname === '/login';

  if (isCinematic) {
    return (
      <div className="min-h-screen flex flex-col bg-[#020d0a] text-[#cbe9df] relative overflow-x-clip selection:bg-emerald-500/30 selection:text-white">
        <div className="fixed top-4 right-4 z-50 opacity-80 hover:opacity-100 transition-opacity">
          <ThemeToggle variant="icon" />
        </div>
        <main className="flex-1 flex flex-col w-full">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-brand-background relative overflow-x-clip">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle variant="icon" />
      </div>
      <div className="flex-1 flex flex-col w-full min-w-0 px-4 sm:px-6">{children}</div>
      <SiteFooter />
    </div>
  );
}
