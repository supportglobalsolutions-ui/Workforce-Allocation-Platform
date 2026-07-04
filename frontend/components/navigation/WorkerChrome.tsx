'use client';

import { usePathname } from 'next/navigation';

import AppShell from '@/components/navigation/AppShell';

/** App chrome for worker routes — bare viewport for dedicated RDP desktop tab. */
export default function WorkerChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const isRdpDesktopTab = /\/worker\/rdp-session\/[^/]+\/desktop\/?$/.test(pathname);

  if (isRdpDesktopTab) {
    return <>{children}</>;
  }

  return <AppShell role="worker">{children}</AppShell>;
}
