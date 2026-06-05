'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Bell, ChevronRight, PanelLeftClose, PanelLeftOpen, Menu, X } from 'lucide-react';
import ThemeToggle from '@/components/theme/ThemeToggle';
import LogoMark from '@/components/theme/LogoMark';
import { useCurrentPage } from '@/lib/navigation/useCurrentPage';
import {
  NavItem,
  PortalRole,
  PUBLIC_TOP_NAV,
  PORTAL_TOP_NAV,
  ROLE_LABELS,
} from '@/lib/navigation/config';
import { PORTAL_LABELS } from '@/lib/pages-registry';

interface TopNavProps {
  variant: 'public' | 'portal';
  role?: PortalRole;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  showSidebarToggle?: boolean;
}

function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex items-center gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              active
                ? 'bg-emerald-accent/10 text-emerald-accent border border-emerald-accent/20'
                : 'text-theme-muted hover:text-theme-heading hover:bg-white/5'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function TopNav({
  variant,
  role,
  sidebarCollapsed,
  onToggleSidebar,
  showSidebarToggle = false,
}: TopNavProps) {
  const { title } = useCurrentPage();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const portalLabel = role
    ? PORTAL_LABELS[role === 'leadership' ? 'leadership' : role === 'worker' ? 'worker' : 'admin']
    : null;

  const topLinks = variant === 'public'
    ? PUBLIC_TOP_NAV
    : role
      ? PORTAL_TOP_NAV[role]
      : [];

  return (
    <>
    <header className="h-14 border-b border-theme bg-brand-surface-lowest/80 backdrop-blur-xl px-4 md:px-6 flex items-center justify-between sticky top-0 z-50 shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {showSidebarToggle && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2 rounded-xl border border-theme hover:bg-white/5 transition-colors shrink-0"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={18} className="text-theme-muted" />
            ) : (
              <PanelLeftClose size={18} className="text-theme-muted" />
            )}
          </button>
        )}

        {variant === 'public' && (
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <LogoMark size="sm" />
            <span className="font-black text-theme-heading text-sm hidden sm:inline">GlobalSolutions</span>
          </Link>
        )}

        {variant === 'portal' && (
          <div className="flex items-center gap-2 min-w-0">
            {portalLabel && (
              <span className="hidden lg:inline text-[10px] font-bold uppercase tracking-wider text-theme-muted font-mono shrink-0">
                {portalLabel}
              </span>
            )}
            {portalLabel && (
              <ChevronRight size={12} className="hidden lg:inline text-theme-muted shrink-0" />
            )}
            <h1 className="text-sm font-bold text-theme-heading truncate">{title}</h1>
          </div>
        )}

        <div className="hidden xl:block ml-4">
          <NavLinks items={topLinks} />
        </div>
      </div>

      {/* Right — theme toggle always top-right */}
      <div className="flex items-center gap-2 shrink-0">
        {variant === 'public' && (
          <button
            type="button"
            className="md:hidden p-2 rounded-xl border border-theme"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        )}
        {variant === 'portal' && (
          <>
            <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-theme-muted mr-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-accent animate-pulse" />
              Live
            </span>
            <Link
              href="/admin/notifications"
              className="relative p-2 rounded-xl border border-transparent hover:border-theme hover:bg-white/5 transition-colors"
            >
              <Bell size={18} className="text-theme-muted" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full" />
            </Link>
          </>
        )}
        <ThemeToggle variant="icon" />
        {variant === 'portal' && role && (
          <span className="hidden md:inline text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border border-gold-accent/20 text-gold-accent bg-gold-accent/5">
            {ROLE_LABELS[role].split(' ')[0]}
          </span>
        )}
      </div>
    </header>
    {variant === 'public' && mobileMenuOpen && (
      <div className="md:hidden border-b border-theme bg-brand-card px-4 py-3 space-y-1 z-40 sticky top-14">
        {topLinks.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                active ? 'bg-emerald-accent/10 text-emerald-accent' : 'text-theme-muted'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </div>
    )}
    </>
  );
}
