'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Bell, PanelLeftClose, PanelLeftOpen, Menu, Search, X } from 'lucide-react';
import ThemeToggle from '@/components/theme/ThemeToggle';
import LogoMark from '@/components/theme/LogoMark';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  PortalRole,
  PUBLIC_TOP_NAV,
  ROLE_LABELS,
} from '@/lib/navigation/config';

interface TopNavProps {
  variant: 'public' | 'portal';
  role?: PortalRole;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  showSidebarToggle?: boolean;
}

export default function TopNav({
  variant,
  role,
  sidebarCollapsed,
  onToggleSidebar,
  showSidebarToggle = false,
}: TopNavProps) {
  const pathname = usePathname();
  const { session } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const initials = session?.displayName
    ? session.displayName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <>
    <header className="h-14 border-b border-theme bg-brand-surface-lowest px-4 md:px-6 flex items-center gap-4 sticky top-0 z-50 shrink-0">
      {/* Left — sidebar toggle + search */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {showSidebarToggle && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2 rounded-xl hover:bg-white/5 transition-colors shrink-0"
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
          <div className="relative w-full max-w-xs hidden md:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
            <input
              type="search"
              placeholder="Search..."
              className="w-full pl-8 pr-4 py-1.5 rounded-full text-sm bg-white/5 border border-theme text-theme-heading placeholder:text-theme-muted focus:outline-none focus:border-emerald-accent/40 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Right — bell, theme, user */}
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
          <Link
            href="/admin/notifications"
            className="relative p-2 rounded-full hover:bg-white/5 transition-colors"
          >
            <Bell size={18} className="text-theme-muted" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full" />
          </Link>
        )}
        <ThemeToggle variant="icon" />
        {variant === 'portal' && session && (
          <div className="flex items-center gap-2.5 pl-2 ml-1 border-l border-theme">
            <span className="w-8 h-8 rounded-full bg-emerald-accent/15 text-emerald-accent flex items-center justify-center text-[11px] font-black shrink-0">
              {initials}
            </span>
            <div className="hidden lg:flex flex-col leading-tight">
              <span className="text-xs font-bold text-theme-heading truncate max-w-[140px]">{session.displayName}</span>
              <span className="text-[10px] text-theme-muted">{role ? ROLE_LABELS[role] : ''}</span>
            </div>
          </div>
        )}
      </div>
    </header>
    {variant === 'public' && mobileMenuOpen && (
      <div className="md:hidden border-b border-theme bg-brand-card px-4 py-3 space-y-1 z-40 sticky top-14">
        {PUBLIC_TOP_NAV.map((item) => {
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
