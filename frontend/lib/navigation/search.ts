import type { AuthRole, AuthSession } from '@/lib/auth/config';
import { PAGES, type PageEntry } from '@/lib/pages-registry';
import {
  PORTAL_SIDEBAR_NAV,
  ROLE_LABELS,
  type NavItem,
  type PortalRole,
} from '@/lib/navigation/config';

export interface SearchResult {
  id: string;
  title: string;
  href: string;
  portal: PortalRole;
  portalLabel: string;
  description: string;
  keywords: string[];
}

/**
 * Every static app route, merged with sidebar + pages registry.
 * Dynamic segments ([id]) are excluded — not searchable destinations.
 */
const ROUTE_CATALOG: Array<{
  title: string;
  href: string;
  portal: PortalRole;
  description: string;
  keywords?: string[];
  authRoles?: AuthRole[];
}> = [
  // Worker
  { title: 'Worker Dashboard', href: '/worker/dashboard', portal: 'worker', description: 'Home — shifts, sessions, and quick actions.', keywords: ['home', 'dashboard'] },
  { title: 'RDP Claim Board', href: '/worker/rdp-claim-board', portal: 'worker', description: 'Claim a remote machine to start work.', keywords: ['rdp', 'machine', 'claim'] },
  { title: 'Active Session', href: '/worker/active-session', portal: 'worker', description: 'Live session while you are working.', keywords: ['session', 'live', 'timer'] },
  { title: 'Session History', href: '/worker/session-history', portal: 'worker', description: 'Past sessions and hours logged.', keywords: ['history', 'sessions', 'hours'] },
  { title: 'Chat with admin', href: '/worker/chat', portal: 'worker', description: 'Message an administrator for help.', keywords: ['chat', 'support', 'admin', 'help', 'contact'] },
  { title: 'My Schedule', href: '/worker/my-schedule', portal: 'worker', description: 'Upcoming and past shifts.', keywords: ['schedule', 'shifts', 'calendar'] },
  { title: 'Training', href: '/worker/training', portal: 'worker', description: 'Assigned training modules.', keywords: ['learning', 'courses'] },
  { title: 'Assessments', href: '/worker/assessments', portal: 'worker', description: 'MCQ tests for quality score.', keywords: ['tests', 'mcq', 'quality'] },
  { title: 'Wallet & Payments', href: '/worker/wallet', portal: 'worker', description: 'Balance, tier, and payslip history.', keywords: ['payroll', 'pay', 'wallet', 'payslip'] },
  { title: 'Notifications', href: '/worker/notifications', portal: 'worker', description: 'Pay and shift alerts.', keywords: ['alerts', 'messages'] },
  { title: 'My Profile', href: '/worker/profile', portal: 'worker', description: 'Your account and employment details.', keywords: ['profile', 'account', 'settings'] },
  { title: 'Leaderboard', href: '/worker/leaderboard', portal: 'worker', description: 'Rankings and quality standings.', keywords: ['rank', 'quality', 'score'] },
  { title: 'Setup Username', href: '/worker/setup-username', portal: 'worker', description: 'Choose your worker username.', keywords: ['onboarding', 'username'] },

  // Admin
  { title: 'Command Center', href: '/admin/dashboard', portal: 'admin', description: 'Operations overview and live feed.', keywords: ['dashboard', 'home', 'kpi'] },
  { title: 'Workers', href: '/admin/workers', portal: 'admin', description: 'Manage worker profiles and history.', keywords: ['people', 'staff', 'team'] },
  { title: 'Accounts', href: '/admin/accounts', portal: 'admin', description: 'Approve signups and manage roles.', keywords: ['users', 'access', 'roles', 'login'], authRoles: ['admin', 'super_admin'] },
  { title: 'Partners', href: '/admin/partners', portal: 'admin', description: 'Partner workers and companies.', keywords: ['partner', 'contractor'], authRoles: ['admin', 'super_admin'] },
  { title: 'Clients', href: '/admin/clients', portal: 'admin', description: 'Client accounts and billing owners.', keywords: ['client', 'customer'] },
  { title: 'RDP Resources', href: '/admin/rdp', portal: 'admin', description: 'Remote machines — status, lock, release.', keywords: ['machine', 'rdp', 'fleet'] },
  { title: 'Sessions', href: '/admin/sessions', portal: 'admin', description: 'All work sessions — live and history.', keywords: ['hours', 'time', 'evidence'] },
  { title: 'Shifts', href: '/admin/shifts', portal: 'admin', description: 'Shift scheduling and assignments.', keywords: ['schedule', 'rota'] },
  { title: 'Quality', href: '/admin/quality', portal: 'admin', description: 'Rate worker communication and organisation.', keywords: ['ratings', 'scores'] },
  { title: 'Calendar', href: '/admin/calendar', portal: 'admin', description: 'Working months and period history.', keywords: ['period', 'month'] },
  { title: 'Finance', href: '/admin/payroll', portal: 'admin', description: 'Payroll periods, approve, and wallets.', keywords: ['payroll', 'pay', 'finance', 'money'] },
  { title: 'Payment Tiers', href: '/admin/payroll/tiers', portal: 'admin', description: 'Pay rates and tier assignments.', keywords: ['payroll', 'rates', 'tiers', 'hourly'] },
  { title: 'Calculate Payroll', href: '/admin/payroll/calculate', portal: 'admin', description: 'Run earnings for the working month.', keywords: ['payroll', 'calculate', 'earnings'] },
  { title: 'Payroll Export', href: '/admin/payroll/export', portal: 'admin', description: 'Download CSV or Excel paysheets.', keywords: ['payroll', 'export', 'csv', 'excel'] },
  { title: 'Communications', href: '/admin/payroll/receipts', portal: 'admin', description: 'Email payslips and announcements.', keywords: ['email', 'payslip', 'receipts', 'comms'] },
  { title: 'Email History', href: '/admin/payroll/receipts/history', portal: 'admin', description: 'Audit every email sent.', keywords: ['email', 'delivery', 'history'] },
  { title: 'Notifications', href: '/admin/notifications', portal: 'admin', description: 'Payroll, machine, and quality alerts.', keywords: ['alerts'] },
  { title: 'Settings', href: '/admin/settings', portal: 'admin', description: 'System configuration and integrations.', keywords: ['config', 'system'] },
  { title: 'Assessment Builder', href: '/admin/assessments', portal: 'admin', description: 'MCQ question bank and assignments.', keywords: ['training', 'tests', 'mcq'] },
  { title: 'Assessment Scores', href: '/admin/assessments/scores', portal: 'admin', description: 'Worker test results.', keywords: ['training', 'scores'] },
  { title: 'Test Results Detail', href: '/admin/assessments/scores/tests', portal: 'admin', description: 'Per-test answer breakdown.', keywords: ['tests', 'answers'] },
  { title: 'Audit Logs', href: '/admin/audit-logs', portal: 'admin', description: 'Append-only system action trail.', keywords: ['audit', 'security', 'logs'], authRoles: ['admin', 'super_admin'] },
  { title: 'Wallets', href: '/admin/wallets', portal: 'admin', description: 'Worker wallet balances.', keywords: ['payroll', 'wallet', 'balance'] },
  { title: 'Currencies', href: '/admin/currencies', portal: 'admin', description: 'Supported payout currencies.', keywords: ['finance', 'currency', 'fx'] },
  { title: 'Live Sessions', href: '/admin/live-sessions', portal: 'admin', description: 'Who is connected right now.', keywords: ['live', 'sessions', 'rdp'] },
  { title: 'Reports', href: '/admin/reports', portal: 'admin', description: 'Operational reports and exports.', keywords: ['analytics', 'reports'] },
  { title: 'Admin Training', href: '/admin/training', portal: 'admin', description: 'Training content management.', keywords: ['training', 'courses'] },
  { title: 'User Directory', href: '/admin/users', portal: 'admin', description: 'Legacy user list.', keywords: ['users'] },

  // Leadership
  { title: 'CEO Command', href: '/leadership/ceo-command', portal: 'leadership', description: 'Executive KPIs and live operations.', keywords: ['ceo', 'dashboard', 'command'] },
  { title: 'Ops Briefing', href: '/leadership/analytics', portal: 'leadership', description: 'Today, week, and month intelligence.', keywords: ['analytics', 'briefing', 'ai', 'insights'] },
  { title: 'Utilization', href: '/leadership/utilization', portal: 'leadership', description: 'Machine use, idle time, capacity.', keywords: ['rdp', 'machines', 'capacity'] },
  { title: 'Financial Intel', href: '/leadership/financial', portal: 'leadership', description: 'Revenue, payouts, and profit by month.', keywords: ['finance', 'revenue', 'payroll', 'profit'] },
];

function registryPortal(p: PageEntry): PortalRole | null {
  if (p.portal === 'worker' || p.portal === 'admin' || p.portal === 'leadership') return p.portal;
  if (p.portal === 'audit' && p.href.startsWith('/admin')) return 'admin';
  return null;
}

function canAccessPortal(session: AuthSession, portal: PortalRole): boolean {
  return session.allowedPortals.includes(portal);
}

function canAccessAuthRoles(session: AuthSession, roles?: AuthRole[]): boolean {
  if (!roles?.length) return true;
  return roles.includes(session.authRole);
}

function catalogToResult(row: (typeof ROUTE_CATALOG)[number]): SearchResult {
  return {
    id: `route:${row.href}`,
    title: row.title,
    href: row.href,
    portal: row.portal,
    portalLabel: ROLE_LABELS[row.portal],
    description: row.description,
    keywords: [row.title, row.description, row.href, ...(row.keywords ?? [])],
  };
}

function navToResult(item: NavItem, portal: PortalRole, registry?: PageEntry): SearchResult {
  const description = registry?.purpose
    ?? (item.shortLabel && item.shortLabel !== item.label ? item.shortLabel : '');
  const keywords = [
    item.label,
    item.shortLabel ?? '',
    item.href,
    ...(registry?.features ?? []),
    ...(registry?.roles ?? []),
    registry?.purpose ?? '',
  ].filter(Boolean);

  return {
    id: `nav:${portal}:${item.href}`,
    title: registry?.title ?? item.label,
    href: item.href,
    portal,
    portalLabel: ROLE_LABELS[portal],
    description,
    keywords,
  };
}

function pageToResult(p: PageEntry, portal: PortalRole): SearchResult {
  return {
    id: `page:${p.id}`,
    title: p.title,
    href: p.href,
    portal,
    portalLabel: ROLE_LABELS[portal],
    description: p.purpose,
    keywords: [p.title, p.purpose, p.href, ...p.features, ...p.roles],
  };
}

const registryByHref = new Map(PAGES.map((p) => [p.href, p]));

/** All pages the signed-in user may open, deduped by href. */
export function getSearchablePages(session: AuthSession | null): SearchResult[] {
  if (!session) return [];

  const byHref = new Map<string, SearchResult>();

  const add = (row: SearchResult, authRoles?: AuthRole[]) => {
    if (!canAccessPortal(session, row.portal)) return;
    if (!canAccessAuthRoles(session, authRoles)) return;
    const existing = byHref.get(row.href);
    if (!existing || row.keywords.length > existing.keywords.length || row.description.length > existing.description.length) {
      byHref.set(row.href, row);
    }
  };

  for (const portal of session.allowedPortals) {
    for (const item of PORTAL_SIDEBAR_NAV[portal]) {
      add(navToResult(item, portal, registryByHref.get(item.href)));
    }
  }

  for (const page of PAGES) {
    const portal = registryPortal(page);
    if (!portal) continue;
    add(pageToResult(page, portal));
  }

  for (const row of ROUTE_CATALOG) {
    add(catalogToResult(row), row.authRoles);
  }

  return Array.from(byHref.values());
}

function scoreMatch(query: string, row: SearchResult): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const title = row.title.toLowerCase();
  const desc = row.description.toLowerCase();
  const href = row.href.toLowerCase();
  const pathParts = href.split('/').filter(Boolean);
  const blob = [title, desc, href, ...pathParts, ...row.keywords.map((k) => k.toLowerCase())].join(' ');

  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (pathParts.some((p) => p.includes(q))) return 55;
  if (href.includes(q)) return 50;
  if (desc.includes(q)) return 40;
  if (blob.includes(q)) return 30;

  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.every((p) => blob.includes(p))) return 20;

  return 0;
}

/** Returns matches only when the user has typed a query. */
export function filterSearchResults(items: SearchResult[], query: string): SearchResult[] {
  const q = query.trim();
  if (!q) return [];

  return items
    .map((row) => ({ row, score: scoreMatch(q, row) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title))
    .map(({ row }) => row)
    .slice(0, 24);
}
