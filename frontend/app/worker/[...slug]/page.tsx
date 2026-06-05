import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import React from 'react';

export default function WorkerPage() {
  const { slug } = useRouter().query as { slug: string[] };

  const componentMap: Record<string, () => Promise<any>> = {
    active_work_session: () => import('../active_work_session/page'),
    worker_management: () => import('../worker_management/page'),
    worker_portal_home: () => import('../worker_portal_home/page'),
    dashboard: () => import('../dashboard/page'),
    leaderboard: () => import('../leaderboard/page'),
    quality: () => import('../quality/page'),
    rdp: () => import('../rdp/page'),
    sessions: () => import('../sessions/page'),
    shifts: () => import('../shifts/page'),
  };

  const loadComponent = componentMap[slug?.[0] ?? ''] ?? (() => import('../dashboard/page'));
  const DynamicComponent = React.useMemo(() => dynamic(loadComponent), [slug]);

  return <DynamicComponent />;
}
