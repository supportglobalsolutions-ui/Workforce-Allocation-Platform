import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import React from 'react';

export default function AdminPage() {
  const { slug } = useRouter().query as { slug: string[] };

  // Determine which component to load based on the first slug segment
  const componentMap: Record<string, () => Promise<any>> = {
    audit_logs: () => import('../audit_logs/page'),
    dashboard: () => import('../dashboard/page'),
    financial_intelligence: () => import('../financial_intelligence/page'),
    partner_management: () => import('../partner_management/page'),
    payroll_revenue_dashboard: () => import('../payroll_revenue_dashboard/page'),
    ratings: () => import('../ratings/page'),
    rdp: () => import('../rdp/page'),
    sessions: () => import('../sessions/page'),
    shifts: () => import('../shifts/page'),
    system_settings: () => import('../system_settings/page'),
  };

  const loadComponent = componentMap[slug?.[0] ?? ''] ?? (() => import('../audit_logs/page'));
  const DynamicComponent = React.useMemo(() => dynamic(loadComponent), [slug]);

  return <DynamicComponent />;
}
