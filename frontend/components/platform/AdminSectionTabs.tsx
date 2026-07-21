'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface SectionTab {
  label: string;
  href: string;
  /** Match active when pathname starts with this (defaults to href). */
  match?: string;
}

function tabMatch(tab: SectionTab): string {
  return tab.match ?? tab.href;
}

function pathMatches(pathname: string, match: string): boolean {
  return pathname === match || pathname.startsWith(match + '/');
}

export function AdminSectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname() || '';

  if (!tabs.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-6 p-1 rounded-xl bg-white/[0.04] border border-white/10 w-fit max-w-full">
      {tabs.map((tab) => {
        const match = tabMatch(tab);
        const active =
          pathMatches(pathname, match) &&
          !tabs.some((other) => {
            if (other.href === tab.href) return false;
            const om = tabMatch(other);
            return pathMatches(pathname, om) && om.length > match.length;
          });

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              active
                ? 'bg-emerald-accent/20 text-emerald-accent'
                : 'text-theme-muted hover:text-theme-heading'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export default AdminSectionTabs;

/** Session history sits under Live Sessions in the sidebar. */
export const SESSIONS_TABS: SectionTab[] = [
  { label: 'Live', href: '/admin/live-sessions' },
  { label: 'History', href: '/admin/sessions' },
];

export const QUALITY_TABS: SectionTab[] = [
  { label: 'Leaderboard', href: '/admin/quality' },
  { label: 'Assessments', href: '/admin/assessments' },
  { label: 'Training', href: '/admin/training' },
];

/** Payouts hub: payroll workbench + wallets / FX / reports. */
export const PAYROLL_TABS: SectionTab[] = [
  { label: 'Workbench', href: '/admin/payroll' },
  { label: 'Calculate', href: '/admin/payroll/calculate' },
  { label: 'Export', href: '/admin/payroll/export' },
  { label: 'Wallets', href: '/admin/wallets' },
  { label: 'Currencies', href: '/admin/currencies' },
  { label: 'Reports', href: '/admin/reports' },
];

/** @deprecated use PAYROLL_TABS */
export const PAYROLL_SUBTABS = PAYROLL_TABS;
/** @deprecated use PAYROLL_TABS */
export const WALLETS_TABS = PAYROLL_TABS;

export const SYSTEM_TABS: SectionTab[] = [
  { label: 'Settings', href: '/admin/settings' },
  { label: 'Audit Logs', href: '/admin/audit-logs' },
];

/** @deprecated kept for any leftover imports — prefer sidebar destinations */
export const PEOPLE_TABS: SectionTab[] = [];
export const OPERATIONS_TABS: SectionTab[] = SESSIONS_TABS;
export const FINANCE_TABS: SectionTab[] = PAYROLL_TABS;
