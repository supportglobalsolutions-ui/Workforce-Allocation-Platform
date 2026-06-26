'use client';

import PageHeader from '@/components/platform/PageHeader';

export default function NotificationCenterPage() {
  return (
    <div>
      <PageHeader
        title="Notification Center"
        description="Payroll, machine, and quality alerts across the platform."
        actions={<button className="btn-secondary text-sm" disabled>Mark All Read</button>}
      />
      <div className="glass-panel p-8 text-center text-brand-on-surface-variant text-sm">
        No notifications yet. Alerts will appear here when payroll, machine, or quality events occur.
      </div>
    </div>
  );
}
