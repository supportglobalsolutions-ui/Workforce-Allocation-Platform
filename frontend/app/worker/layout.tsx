import AppShell from '@/components/navigation/AppShell';
import PortalGuard from '@/components/auth/PortalGuard';

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGuard requiredPortal="worker">
      <AppShell role="worker">{children}</AppShell>
    </PortalGuard>
  );
}
