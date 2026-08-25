'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import LogoMark from '@/components/theme/LogoMark';
import {
  NavItem,
  PortalRole,
  PORTAL_SIDEBAR_NAV,
} from '@/lib/navigation/config';

interface CollapsibleSidebarProps {
  role: PortalRole;
  collapsed: boolean;
  onClose?: () => void;
  mobileOpen?: boolean;
}

function sectionMatch(pathname: string | null, href: string): boolean {
  if (!pathname) return false;

  if (href === '/admin/payroll') {
    if (pathname === '/admin/payroll/receipts' || pathname.startsWith('/admin/payroll/receipts/')) {
      return false;
    }
    if (pathname === href || pathname.startsWith(href + '/')) return true;
    return ['/admin/wallets', '/admin/currencies', '/admin/reports', '/admin/calendar'].some(
      (p) => pathname === p || pathname.startsWith(p + '/')
    );
  }

  if (pathname === href || pathname.startsWith(href + '/')) return true;

  const hubs: Record<string, string[]> = {
    '/admin/sessions': ['/admin/sessions', '/admin/live-sessions'],
    '/admin/quality': ['/admin/quality', '/admin/assessments', '/admin/training'],
    '/admin/settings': ['/admin/settings', '/admin/audit-logs'],
  };
  const paths = hubs[href];
  if (!paths) return false;
  return paths.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function SidebarLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = sectionMatch(pathname, item.href);

  return (
    <Link
      href={item.href}
      prefetch
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all min-h-[44px] ${
        collapsed ? 'justify-center' : ''
      } ${isActive ? 'sidebar-link-active' : 'sidebar-link'}`}
    >
      <span className="shrink-0">{item.icon}</span>
      {!collapsed && (
        <span className="font-semibold text-sm truncate flex-1">{item.label}</span>
      )}
    </Link>
  );
}

export default function CollapsibleSidebar({
  role,
  collapsed,
  onClose,
  mobileOpen = false,
}: CollapsibleSidebarProps) {
  const items = PORTAL_SIDEBAR_NAV[role];

  return (
    <aside
      className={`relative h-full flex flex-col app-sidebar transition-all duration-300 ease-in-out w-full md:w-auto ${
        collapsed ? 'md:w-[72px]' : 'md:w-[240px]'
      }`}
    >
      <div
        className={`border-b sidebar-divider flex items-center gap-2 ${
          mobileOpen ? 'p-4 justify-between' : collapsed ? 'p-3 justify-center' : 'p-5'
        }`}
      >
        <Link href="/" className={`flex items-center gap-2 min-w-0 ${collapsed ? 'justify-center' : ''}`} onClick={mobileOpen ? onClose : undefined}>
          <LogoMark size="sm" />
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-base font-black sidebar-text-strong tracking-tight leading-none truncate">GlobalSolutions</h1>
              <p className="text-[9px] font-bold text-gold-accent tracking-[0.2em] uppercase mt-1">Operations</p>
            </div>
          )}
        </Link>
        {mobileOpen && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="md:hidden p-2 rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/[0.06] shrink-0"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overscroll-contain">
        {!collapsed && (
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gold-accent/80">Navigation</p>
        )}
        {items.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            onNavigate={mobileOpen ? onClose : undefined}
          />
        ))}
      </nav>
    </aside>
  );
}
