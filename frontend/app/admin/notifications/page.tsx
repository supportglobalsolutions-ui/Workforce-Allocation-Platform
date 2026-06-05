'use client';

import PageHeader from '@/components/platform/PageHeader';
import { notifications } from '@/lib/mock-data';

const typeColors: Record<string, string> = {
  machine: 'text-danger',
  payroll: 'text-gold-accent',
  quality: 'text-emerald-accent',
};

export default function NotificationCenterPage() {
  return (
    <div>
      <PageHeader
        title="Notification Center"
        description="Payroll, machine, and quality alerts across the platform."
        actions={<button className="btn-secondary text-sm">Mark All Read</button>}
      />
      <div className="space-y-3">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`glass-panel p-4 flex items-start gap-4 ${!n.read ? 'border-emerald-accent/20' : ''}`}
          >
            {!n.read && <span className="w-2 h-2 rounded-full bg-emerald-accent mt-2 shrink-0" />}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase ${typeColors[n.type]}`}>{n.type}</span>
                <span className="text-xs text-brand-on-surface-variant">{n.time}</span>
              </div>
              <p className="font-bold text-white text-sm">{n.title}</p>
              <p className="text-sm text-brand-on-surface-variant">{n.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
