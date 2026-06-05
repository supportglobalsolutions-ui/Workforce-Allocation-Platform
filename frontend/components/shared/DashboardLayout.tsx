'use client';

import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, Monitor, Settings, FileText, Trophy, Landmark,
  LogOut, ChevronDown, Bell, ClipboardList, DollarSign, BarChart3,
  Activity, Shield, BookOpen, Globe2, Zap, History, PenLine,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PAGES, Portal, PORTAL_LABELS } from '@/lib/pages-registry';

type UserRole = 'worker' | 'admin' | 'leadership';

interface NavItem {
  icon: React.ReactNode;
  label: string;
  href: string;
}

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  worker: [
    { icon: <LayoutDashboard size={18} />, label: 'Dashboard', href: '/worker/dashboard' },
    { icon: <Monitor size={18} />, label: 'RDP Claim Board', href: '/worker/rdp-claim-board' },
    { icon: <Activity size={18} />, label: 'Active Session', href: '/worker/active-session' },
    { icon: <History size={18} />, label: 'Session History', href: '/worker/session-history' },
    { icon: <PenLine size={18} />, label: 'External Logging', href: '/worker/external-session' },
    { icon: <BookOpen size={18} />, label: 'Assessments', href: '/worker/assessments' },
    { icon: <Trophy size={18} />, label: 'Leaderboard', href: '/worker/leaderboard' },
  ],
  admin: [
    { icon: <LayoutDashboard size={18} />, label: 'Command Center', href: '/admin/dashboard' },
    { icon: <Users size={18} />, label: 'Workers', href: '/admin/workers' },
    { icon: <Globe2 size={18} />, label: 'Partners', href: '/admin/partners' },
    { icon: <Monitor size={18} />, label: 'RDP Resources', href: '/admin/rdp' },
    { icon: <Activity size={18} />, label: 'Live Sessions', href: '/admin/live-sessions' },
    { icon: <ClipboardList size={18} />, label: 'Quality', href: '/admin/quality' },
    { icon: <BookOpen size={18} />, label: 'Assessments', href: '/admin/assessments' },
    { icon: <DollarSign size={18} />, label: 'Payroll', href: '/admin/payroll' },
    { icon: <FileText size={18} />, label: 'Audit Logs', href: '/admin/audit-logs' },
    { icon: <Bell size={18} />, label: 'Notifications', href: '/admin/notifications' },
    { icon: <Settings size={18} />, label: 'Settings', href: '/admin/settings' },
  ],
  leadership: [
    { icon: <Landmark size={18} />, label: 'CEO Command', href: '/leadership/ceo-command' },
    { icon: <BarChart3 size={18} />, label: 'Analytics', href: '/leadership/analytics' },
    { icon: <Zap size={18} />, label: 'Utilization', href: '/leadership/utilization' },
    { icon: <DollarSign size={18} />, label: 'Financial Intel', href: '/leadership/financial' },
  ],
};

function detectRole(pathname: string): UserRole {
  if (pathname.startsWith('/worker')) return 'worker';
  if (pathname.startsWith('/leadership')) return 'leadership';
  return 'admin';
}

export default function DashboardLayout({
  children,
  role: initialRole,
}: {
  children: React.ReactNode;
  role?: UserRole;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentRole, setCurrentRole] = useState<UserRole>(initialRole ?? 'admin');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (pathname) setCurrentRole(detectRole(pathname));
    else if (initialRole) setCurrentRole(initialRole);
  }, [pathname, initialRole]);

  const handleRoleChange = (role: UserRole) => {
    setCurrentRole(role);
    setIsDropdownOpen(false);
    const landing: Record<UserRole, string> = {
      admin: '/admin/dashboard',
      worker: '/worker/dashboard',
      leadership: '/leadership/ceo-command',
    };
    router.push(landing[role]);
  };

  const getRoleLabel = (r: UserRole) => {
    switch (r) {
      case 'admin': return 'Operations Lead';
      case 'worker': return 'Worker Portal';
      case 'leadership': return 'Executive Leadership';
    }
  };

  const getRoleColor = (r: UserRole) => {
    switch (r) {
      case 'admin': return 'text-emerald-accent border-emerald-accent/30 bg-emerald-accent/5';
      case 'worker': return 'text-brand-tertiary border-brand-tertiary/30 bg-brand-tertiary/5';
      case 'leadership': return 'text-gold-accent border-gold-accent/30 bg-gold-accent/5';
    }
  };

  const items = NAV_BY_ROLE[currentRole];

  return (
    <div className="min-h-screen bg-brand-background text-brand-on-surface flex font-sans overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-emerald-accent/[0.02] rounded-full blur-[120px]" />
        <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-gold-accent/[0.01] rounded-full blur-[100px]" />
      </div>

      <aside className="w-[280px] bg-brand-surface-lowest/90 backdrop-blur-xl border-r border-white/5 flex flex-col fixed inset-y-0 left-0 z-40">
        <div className="p-6 border-b border-white/5">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/images/logo.png" alt="GlobalSolutions Logo" width={32} height={32} className="rounded-lg" />
            <div>
              <h1 className="text-lg font-black text-white tracking-tight leading-none">GlobalSolutions</h1>
              <p className="text-[9px] font-bold text-gold-accent tracking-[0.25em] uppercase mt-1">Operations Platform</p>
            </div>
          </Link>
        </div>

        <div className="px-4 py-3 border-b border-white/5 relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left"
          >
            <div className="flex flex-col">
              <span className="text-[10px] text-brand-on-surface-variant font-bold uppercase tracking-wider">Workspace</span>
              <span className="text-sm font-bold text-white mt-0.5">{getRoleLabel(currentRole)}</span>
            </div>
            <ChevronDown size={16} className={`text-brand-on-surface-variant transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {isDropdownOpen && (
            <div className="absolute top-[calc(100%-8px)] left-4 right-4 bg-brand-card border border-white/10 rounded-xl shadow-2xl p-2 z-50">
              {(['worker', 'admin', 'leadership'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all mb-1 last:mb-0 flex items-center justify-between ${
                    currentRole === r ? 'bg-white/5 text-white' : 'text-brand-on-surface-variant hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <span>{getRoleLabel(r)}</span>
                  <span className={`px-2 py-0.5 text-[8px] rounded border uppercase font-mono ${getRoleColor(r)}`}>{r}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all group ${
                  isActive
                    ? 'bg-brand-surface-high/60 text-white border-l-2 border-gold-accent'
                    : 'text-brand-on-surface-variant hover:bg-white/[0.02] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? 'text-emerald-accent' : 'text-brand-on-surface-variant group-hover:text-emerald-accent transition-colors'}>
                    {item.icon}
                  </span>
                  <span className="font-semibold text-sm">{item.label}</span>
                </div>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-gold-accent shadow-[0_0_8px_#D4AF37]" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/5 space-y-1">
          <Link
            href="/pages"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-brand-on-surface-variant hover:text-emerald-accent hover:bg-white/[0.02] transition-colors"
          >
            <Shield size={14} />
            All Pages ({PAGES.length})
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-brand-on-surface-variant hover:text-white hover:bg-white/[0.02] transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </Link>
        </div>
      </aside>

      <div className="flex-1 ml-[280px] relative min-h-screen z-10 flex flex-col">
        <header className="h-14 border-b border-white/5 bg-brand-surface-lowest/40 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-accent animate-pulse shadow-[0_0_10px_#3FC7A0]" />
            <span className="text-[10px] font-bold text-brand-on-surface-variant tracking-wider uppercase font-mono">
              {PORTAL_LABELS[currentRole === 'leadership' ? 'leadership' : currentRole === 'worker' ? 'worker' : 'admin']}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin/notifications" className="relative p-1.5 rounded-lg hover:bg-white/5 transition-colors">
              <Bell size={16} className="text-brand-on-surface-variant" />
              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-danger rounded-full" />
            </Link>
            <span className="text-xs font-mono text-white hidden sm:block">{new Date().toLocaleTimeString()}</span>
          </div>
        </header>
        <main className="p-6 md:p-8 flex-1 w-full">{children}</main>
      </div>
    </div>
  );
}
