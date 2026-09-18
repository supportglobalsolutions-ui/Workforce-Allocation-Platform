'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/rdp', label: 'Resources', exact: true },
  { href: '/admin/rdp/claim', label: 'Claim board', exact: false },
] as const;

export default function AdminRdpSubnav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-white/10 pb-3">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? 'bg-emerald-accent/15 text-emerald-accent'
                : 'text-theme-muted hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
