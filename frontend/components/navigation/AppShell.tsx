'use client';

import { useState, useEffect } from 'react';
import TopNav from './TopNav';
import CollapsibleSidebar from './CollapsibleSidebar';
import SiteFooter from '@/components/layout/SiteFooter';
import { PortalRole, SIDEBAR_STORAGE_KEY } from '@/lib/navigation/config';

interface AppShellProps {
  children: React.ReactNode;
  role: PortalRole;
}

export default function AppShell({ children, role }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === 'true') setSidebarCollapsed(true);
    setMounted(true);
  }, []);

  const toggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileSidebarOpen((prev) => !prev);
      return;
    }
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  const collapsed = mounted && sidebarCollapsed;

  return (
    <div className="min-h-screen bg-brand-background text-brand-on-surface flex font-sans overflow-x-hidden">
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed md:static inset-y-0 left-0 z-40 transition-transform duration-300 md:translate-x-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <CollapsibleSidebar role={role} collapsed={collapsed} />
      </div>

      <div
        className={`flex-1 relative min-h-screen z-10 flex flex-col w-full transition-[margin] duration-300 ease-in-out ${
          collapsed ? 'md:ml-[72px]' : 'md:ml-[280px]'
        }`}
      >
        <TopNav
          variant="portal"
          role={role}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggleSidebar}
          showSidebarToggle
        />
        <main className="p-4 md:p-6 lg:p-8 flex-1 w-full max-w-[1600px]">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
