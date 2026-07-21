import {
  LayoutDashboard, Users, Monitor, Settings, Trophy, Landmark,
  Bell, DollarSign, BarChart3, Activity, BookOpen, Briefcase,
  Zap, History, Home, Lock, Shield, CalendarDays, UserCircle,
  Wallet, GraduationCap, Building2, Mail, ShieldCheck,
} from 'lucide-react';

export type PortalRole = 'worker' | 'admin' | 'leadership';

export interface NavItem {
  icon: React.ReactNode;
  label: string;
  href: string;
  shortLabel?: string;
}

export const SIDEBAR_STORAGE_KEY = 'gs-sidebar-collapsed';

export const PORTAL_SIDEBAR_NAV: Record<PortalRole, NavItem[]> = {
  worker: [
    { icon: <LayoutDashboard size={18} />, label: 'Dashboard', href: '/worker/dashboard' },
    { icon: <Monitor size={18} />, label: 'RDP Claim Board', href: '/worker/rdp-claim-board', shortLabel: 'RDP Board' },
    { icon: <Activity size={18} />, label: 'Active Session', href: '/worker/active-session' },
    { icon: <History size={18} />, label: 'Session History', href: '/worker/session-history', shortLabel: 'History' },
    { icon: <CalendarDays size={18} />, label: 'My Schedule', href: '/worker/my-schedule', shortLabel: 'Schedule' },
    { icon: <GraduationCap size={18} />, label: 'Training', href: '/worker/training' },
    { icon: <BookOpen size={18} />, label: 'Assessments', href: '/worker/assessments' },
    { icon: <Trophy size={18} />, label: 'Leaderboard', href: '/worker/leaderboard' },
    { icon: <Wallet size={18} />, label: 'Wallet & Payments', href: '/worker/wallet', shortLabel: 'Wallet' },
    { icon: <Bell size={18} />, label: 'Notifications', href: '/worker/notifications' },
    { icon: <UserCircle size={18} />, label: 'My Profile', href: '/worker/profile', shortLabel: 'Profile' },
  ],
  admin: [
    { icon: <LayoutDashboard size={18} />, label: 'Command Center', href: '/admin/dashboard', shortLabel: 'Command' },
    { icon: <Users size={18} />, label: 'Workers', href: '/admin/workers' },
    { icon: <ShieldCheck size={18} />, label: 'Accounts', href: '/admin/accounts' },
    { icon: <Building2 size={18} />, label: 'Partners', href: '/admin/partners' },
    { icon: <Briefcase size={18} />, label: 'Clients', href: '/admin/clients' },
    { icon: <Monitor size={18} />, label: 'RDP Resources', href: '/admin/rdp', shortLabel: 'RDP' },
    { icon: <Activity size={18} />, label: 'Live Sessions', href: '/admin/live-sessions', shortLabel: 'Live' },
    { icon: <CalendarDays size={18} />, label: 'Shifts', href: '/admin/shifts' },
    { icon: <Trophy size={18} />, label: 'Quality', href: '/admin/quality' },
    { icon: <DollarSign size={18} />, label: 'Payouts', href: '/admin/payroll', shortLabel: 'Pay' },
    { icon: <Mail size={18} />, label: 'Communications', href: '/admin/payroll/receipts', shortLabel: 'Comms' },
    { icon: <Bell size={18} />, label: 'Notifications', href: '/admin/notifications', shortLabel: 'Alerts' },
    { icon: <Settings size={18} />, label: 'Settings', href: '/admin/settings' },
  ],
  leadership: [
    { icon: <Landmark size={18} />, label: 'CEO Command', href: '/leadership/ceo-command' },
    { icon: <BarChart3 size={18} />, label: 'Analytics', href: '/leadership/analytics' },
    { icon: <Zap size={18} />, label: 'Utilization', href: '/leadership/utilization' },
    { icon: <DollarSign size={18} />, label: 'Financial Intel', href: '/leadership/financial', shortLabel: 'Financial' },
  ],
};

/** Top bar quick links per portal (subset of sidebar — current section highlights) */
export const PORTAL_TOP_NAV: Record<PortalRole, NavItem[]> = {
  worker: [
    { icon: <LayoutDashboard size={16} />, label: 'Dashboard', href: '/worker/dashboard' },
    { icon: <Monitor size={16} />, label: 'RDP Board', href: '/worker/rdp-claim-board' },
    { icon: <Activity size={16} />, label: 'Session', href: '/worker/active-session' },
    { icon: <Trophy size={16} />, label: 'Leaderboard', href: '/worker/leaderboard' },
  ],
  admin: [
    { icon: <LayoutDashboard size={16} />, label: 'Command', href: '/admin/dashboard' },
    { icon: <Users size={16} />, label: 'Workers', href: '/admin/workers' },
    { icon: <Monitor size={16} />, label: 'RDP', href: '/admin/rdp' },
    { icon: <Activity size={16} />, label: 'Live', href: '/admin/live-sessions' },
    { icon: <DollarSign size={16} />, label: 'Payouts', href: '/admin/payroll' },
  ],
  leadership: [
    { icon: <Landmark size={16} />, label: 'CEO', href: '/leadership/ceo-command' },
    { icon: <BarChart3 size={16} />, label: 'Analytics', href: '/leadership/analytics' },
    { icon: <Zap size={16} />, label: 'Utilization', href: '/leadership/utilization' },
  ],
};

export const PUBLIC_TOP_NAV: NavItem[] = [
  { icon: <Home size={16} />, label: 'Home', href: '/' },
  { icon: <Shield size={16} />, label: 'All Pages', href: '/pages' },
  { icon: <Lock size={16} />, label: 'Login', href: '/login' },
  { icon: <LayoutDashboard size={16} />, label: 'Worker', href: '/worker/dashboard' },
  { icon: <Landmark size={16} />, label: 'Admin', href: '/admin/dashboard' },
];

export const ROLE_LABELS: Record<PortalRole, string> = {
  worker: 'Worker Portal',
  admin: 'Operations Lead',
  leadership: 'Executive Command',
};

export const ROLE_LANDING: Record<PortalRole, string> = {
  worker: '/worker/dashboard',
  admin: '/admin/dashboard',
  leadership: '/leadership/ceo-command',
};

export function detectRoleFromPath(pathname: string): PortalRole {
  if (pathname.startsWith('/worker')) return 'worker';
  if (pathname.startsWith('/leadership')) return 'leadership';
  return 'admin';
}

export function isPortalPath(pathname: string): boolean {
  return pathname.startsWith('/worker') || pathname.startsWith('/admin') || pathname.startsWith('/leadership');
}
