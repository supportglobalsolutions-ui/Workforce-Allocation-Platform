import Link from 'next/link';

const TABS = [
  { label: 'Overview', href: '/admin/payroll' },
  { label: 'Calculate', href: '/admin/payroll/calculate' },
  { label: 'Export', href: '/admin/payroll/export' },
  { label: 'Send Receipts', href: '/admin/payroll/receipts' },
];

export default function PayrollTabs({ active }: { active: string }) {
  return (
    <div className="flex gap-2 mb-8 overflow-x-auto scrollbar-thin pb-0.5">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
            tab.href === active
              ? 'bg-emerald-accent/10 text-emerald-accent border border-emerald-accent/25'
              : 'text-theme-muted hover:text-theme-heading hover:bg-black/[0.03] border border-transparent'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
