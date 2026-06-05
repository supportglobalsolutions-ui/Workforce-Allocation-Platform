import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import React from 'react';

export default function LeadershipPage() {
  const { slug } = useRouter().query as { slug: string[] };

  const componentMap: Record<string, () => Promise<any>> = {
    audit: () => import('../audit/page'),
    dashboard: () => import('../dashboard/page'),
    global_leaderboard: () => import('../global_leaderboard/page'),
    operations_command_center: () => import('../operations_command_center/page'),
    payroll: () => import('../payroll/page'),
    performance: () => import('../performance/page'),
    rdp_claim_board: () => import('../rdp_claim_board/page'),
    rdp_resource_management: () => import('../rdp_resource_management/page'),
    session_history: () => import('../session_history/page'),
  };

  const loadComponent = componentMap[slug?.[0] ?? ''] ?? (() => import('../dashboard/page'));
  const DynamicComponent = React.useMemo(() => dynamic(loadComponent), [slug]);

  return <DynamicComponent />;
}
