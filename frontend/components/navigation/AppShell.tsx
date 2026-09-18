'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import TopNav from './TopNav';
import CollapsibleSidebar from './CollapsibleSidebar';
import SiteFooter from '@/components/layout/SiteFooter';
import NotificationToast from './NotificationToast';
import { PortalRole, SIDEBAR_STORAGE_KEY } from '@/lib/navigation/config';

interface AppShellProps {
  children: React.ReactNode;
  role: PortalRole;
}

export default function AppShell({ children, role }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle('nav-scroll-lock', mobileSidebarOpen);
    return () => document.body.classList.remove('nav-scroll-lock');
  }, [mobileSidebarOpen]);

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

  const closeMobileSidebar = () => setMobileSidebarOpen(false);
  const effectiveCollapsed = mobileSidebarOpen ? false : sidebarCollapsed;

  return (
    <div className="min-h-screen bg-brand-background text-brand-on-surface flex font-sans overflow-x-clip">
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-40 w-[min(280px,88vw)] md:w-auto transition-transform duration-300 md:translate-x-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <CollapsibleSidebar
          role={role}
          collapsed={effectiveCollapsed}
          onClose={closeMobileSidebar}
          mobileOpen={mobileSidebarOpen}
        />
      </div>

      <div
        className={`flex-1 relative min-h-screen z-10 flex flex-col w-full min-w-0 transition-[margin] duration-300 ease-in-out ${
          sidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-[240px]'
        }`}
      >
        <TopNav
          variant="portal"
          role={role}
          sidebarCollapsed={sidebarCollapsed}
          mobileSidebarOpen={mobileSidebarOpen}
          onToggleSidebar={toggleSidebar}
          showSidebarToggle
        />
        <main className="p-4 sm:p-5 md:p-6 lg:p-8 flex-1 w-full min-w-0 max-w-[1600px] mx-auto">{children}</main>
        <SiteFooter />
        {role === 'worker' && (
          <NotificationToast profileHref="/worker/profile" />
        )}
      </div>
    </div>
  );
}
