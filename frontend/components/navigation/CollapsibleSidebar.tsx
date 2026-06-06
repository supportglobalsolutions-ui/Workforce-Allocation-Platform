'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, LogOut } from 'lucide-react';
import { useState } from 'react';
import LogoMark from '@/components/theme/LogoMark';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  NavItem,
  PortalRole,
  PORTAL_SIDEBAR_NAV,
  ROLE_LABELS,
  ROLE_LANDING,
} from '@/lib/navigation/config';

interface CollapsibleSidebarProps {
  role: PortalRole;
  collapsed: boolean;
}

function getRoleColor(r: PortalRole) {
  switch (r) {
    case 'admin': return 'text-emerald-accent border-emerald-accent/30 bg-emerald-accent/5';
    case 'worker': return 'text-brand-tertiary border-brand-tertiary/30 bg-brand-tertiary/5';
    case 'leadership': return 'text-gold-accent border-gold-accent/30 bg-gold-accent/5';
  }
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

  return (
    <Link
      href={item.href}
      prefetch
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
        collapsed ? 'justify-center' : ''
      } ${
        isActive
          ? 'bg-brand-surface-high/60 text-theme-heading border-l-2 border-gold-accent'
          : 'text-theme-muted hover:bg-white/[0.02] hover:text-theme-heading'
      }`}
    >
      <span className={isActive ? 'text-emerald-accent shrink-0' : 'text-theme-muted group-hover:text-emerald-accent transition-colors shrink-0'}>
        {item.icon}
      </span>
      {!collapsed && (
        <>
          <span className="font-semibold text-sm truncate flex-1">{item.label}</span>
          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-gold-accent shadow-[0_0_8px_#D4AF37] shrink-0" />}
        </>
      )}
    </Link>
  );
}

export default function CollapsibleSidebar({ role, collapsed }: CollapsibleSidebarProps) {
  const { session, logout, canAccess } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const items = PORTAL_SIDEBAR_NAV[role];

  const allowedPortals = (session?.allowedPortals ?? [role]).filter((p) => canAccess(p));
  const showSwitcher = allowedPortals.length > 1;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-brand-surface-lowest/95 backdrop-blur-xl border-r border-theme transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[72px]' : 'w-[280px]'
      }`}
    >
      <div className={`border-b border-theme ${collapsed ? 'p-3 flex justify-center' : 'p-5'}`}>
        <Link href="/" className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
          <LogoMark size="sm" />
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-base font-black text-theme-heading tracking-tight leading-none truncate">GlobalSolutions</h1>
              <p className="text-[9px] font-bold text-gold-accent tracking-[0.2em] uppercase mt-1">Operations</p>
            </div>
          )}
        </Link>
      </div>

      {showSwitcher && (
        <div className={`border-b border-theme relative ${collapsed ? 'px-2 py-2' : 'px-3 py-3'}`}>
          <button
            type="button"
            onClick={() => !collapsed && setIsDropdownOpen(!isDropdownOpen)}
            title={ROLE_LABELS[role]}
            className={`w-full flex items-center rounded-xl bg-white/5 hover:bg-white/10 border border-gold-accent/15 transition-all ${
              collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2 text-left'
            }`}
          >
            {!collapsed ? (
              <>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-gold-accent font-bold uppercase tracking-wider">Workspace</span>
                  <span className="text-sm font-bold text-theme-heading mt-0.5 truncate">{ROLE_LABELS[role]}</span>
                </div>
                <ChevronDown size={16} className={`text-theme-muted transition-transform shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </>
            ) : (
              <span className={`text-[10px] font-black uppercase ${getRoleColor(role).split(' ')[0]}`}>
                {role[0].toUpperCase()}
              </span>
            )}
          </button>
          {isDropdownOpen && !collapsed && (
            <div className="absolute top-[calc(100%-4px)] left-3 right-3 bg-brand-card border border-gold-accent/20 rounded-xl shadow-2xl p-2 z-50 glass-modal">
              {allowedPortals.map((r) => (
                <Link
                  key={r}
                  href={ROLE_LANDING[r]}
                  prefetch
                  onClick={() => setIsDropdownOpen(false)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all mb-1 last:mb-0 flex items-center justify-between ${
                    role === r ? 'bg-gold-accent/10 text-theme-heading' : 'text-theme-muted hover:text-theme-heading hover:bg-white/[0.02]'
                  }`}
                >
                  <span>{ROLE_LABELS[r]}</span>
                  <span className={`px-2 py-0.5 text-[8px] rounded border uppercase font-mono ${getRoleColor(r)}`}>{r}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {!showSwitcher && !collapsed && session && (
        <div className="px-3 py-3 border-b border-theme">
          <p className="text-[10px] text-gold-accent font-bold uppercase tracking-wider">Workspace</p>
          <p className="text-sm font-bold text-theme-heading mt-0.5">{ROLE_LABELS[role]}</p>
        </div>
      )}

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gold-accent/80">Navigation</p>
        )}
        {items.map((item) => (
          <SidebarLink key={item.href} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div className={`border-t border-theme ${collapsed ? 'p-2' : 'p-3'}`}>
        <button
          type="button"
          onClick={logout}
          title="Sign Out"
          className={`w-full flex items-center gap-2 rounded-xl text-xs font-medium text-theme-muted hover:text-theme-heading hover:bg-white/[0.02] transition-colors ${
            collapsed ? 'justify-center p-2.5' : 'px-3 py-2'
          }`}
        >
          <LogOut size={14} className="shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
