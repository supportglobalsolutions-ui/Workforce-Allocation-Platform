'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoMark from '@/components/theme/LogoMark';
import {
  NavItem,
  PortalRole,
  PORTAL_SIDEBAR_NAV,
} from '@/lib/navigation/config';

interface CollapsibleSidebarProps {
  role: PortalRole;
  collapsed: boolean;
}

function sectionMatch(pathname: string | null, href: string): boolean {
  if (!pathname) return false;

  // Payouts owns workbench + wallets; Communications owns receipts; Calendar is its own nav item
  if (href === '/admin/payroll') {
    if (pathname === '/admin/payroll/receipts' || pathname.startsWith('/admin/payroll/receipts/')) {
      return false;
    }
    if (pathname === href || pathname.startsWith(href + '/')) return true;
    return ['/admin/wallets', '/admin/currencies', '/admin/reports'].some(
      (p) => pathname === p || pathname.startsWith(p + '/')
    );
  }

  if (pathname === href || pathname.startsWith(href + '/')) return true;

  // Hubs: highlight parent for sibling tab routes still nested under one item
  const hubs: Record<string, string[]> = {
    '/admin/live-sessions': ['/admin/live-sessions', '/admin/sessions'],
    '/admin/quality': ['/admin/quality', '/admin/assessments', '/admin/training'],
    '/admin/settings': ['/admin/settings', '/admin/audit-logs'],
  };
  const paths = hubs[href];
  if (!paths) return false;
  return paths.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const isActive = sectionMatch(pathname, item.href);

  return (
    <Link
      href={item.href}
      prefetch
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
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

export default function CollapsibleSidebar({ role, collapsed }: CollapsibleSidebarProps) {
  const items = PORTAL_SIDEBAR_NAV[role];

  return (
    <aside
      className={`relative h-full flex flex-col app-sidebar transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[72px]' : 'w-[240px]'
      }`}
    >
      <div className={`border-b sidebar-divider ${collapsed ? 'p-3 flex justify-center' : 'p-5'}`}>
        <Link href="/" className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
          <LogoMark size="sm" />
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-base font-black sidebar-text-strong tracking-tight leading-none truncate">GlobalSolutions</h1>
              <p className="text-[9px] font-bold text-gold-accent tracking-[0.2em] uppercase mt-1">Operations</p>
            </div>
          )}
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gold-accent/80">Navigation</p>
        )}
        {items.map((item) => (
          <SidebarLink key={item.href} item={item} collapsed={collapsed} />
        ))}
      </nav>
    </aside>
  );
}
