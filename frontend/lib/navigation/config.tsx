import {
  LayoutDashboard, Users, Monitor, Settings, FileText, Trophy, Landmark,
  Bell, ClipboardList, DollarSign, BarChart3, Activity, BookOpen, Globe2,
  Zap, History, PenLine, Home, Lock, Shield, Send, UserCog, CalendarDays, UserCircle,
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
    { icon: <PenLine size={18} />, label: 'External Logging', href: '/worker/external-session', shortLabel: 'External' },
    { icon: <BookOpen size={18} />, label: 'Assessments', href: '/worker/assessments' },
    { icon: <Trophy size={18} />, label: 'Leaderboard', href: '/worker/leaderboard' },
    { icon: <Bell size={18} />, label: 'Notifications', href: '/worker/notifications' },
    { icon: <UserCircle size={18} />, label: 'My Profile', href: '/worker/profile', shortLabel: 'Profile' },
  ],
  admin: [
    { icon: <LayoutDashboard size={18} />, label: 'Command Center', href: '/admin/dashboard' },
    { icon: <Users size={18} />, label: 'Workers', href: '/admin/workers' },
    { icon: <Globe2 size={18} />, label: 'Partners', href: '/admin/partners' },
    { icon: <Monitor size={18} />, label: 'RDP Resources', href: '/admin/rdp' },
    { icon: <Activity size={18} />, label: 'Live Sessions', href: '/admin/live-sessions' },
    { icon: <History size={18} />, label: 'Sessions', href: '/admin/sessions' },
    { icon: <ClipboardList size={18} />, label: 'Quality', href: '/admin/quality' },
    { icon: <BookOpen size={18} />, label: 'Assessments', href: '/admin/assessments' },
    { icon: <DollarSign size={18} />, label: 'Payroll', href: '/admin/payroll' },
    { icon: <Send size={18} />, label: 'Send Receipts', href: '/admin/payroll/receipts', shortLabel: 'Receipts' },
    { icon: <CalendarDays size={18} />, label: 'Shifts', href: '/admin/shifts' },
    { icon: <FileText size={18} />, label: 'Audit Logs', href: '/admin/audit-logs' },
    { icon: <Bell size={18} />, label: 'Notifications', href: '/admin/notifications' },
    { icon: <UserCog size={18} />, label: 'User Management', href: '/admin/users', shortLabel: 'Users' },
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
    { icon: <DollarSign size={16} />, label: 'Payroll', href: '/admin/payroll' },
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
