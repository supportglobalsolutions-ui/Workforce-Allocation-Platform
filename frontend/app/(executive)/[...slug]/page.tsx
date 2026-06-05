import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import React from 'react';

export default function ExecutivePage() {
  const { slug } = useRouter().query as { slug: string[] };

  const componentMap: Record<string, () => Promise<any>> = {
    ceo_command_center: () => import('../ceo_command_center/page'),
    executive_login: () => import('../executive_login/page'),
  };

  const loadComponent = componentMap[slug?.[0] ?? ''] ?? (() => import('../ceo_command_center/page'));
  const DynamicComponent = React.useMemo(() => dynamic(loadComponent), [slug]);

  return <DynamicComponent />;
}
