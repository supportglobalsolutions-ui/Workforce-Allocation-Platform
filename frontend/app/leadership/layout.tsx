import AppShell from '@/components/navigation/AppShell';
import PortalGuard from '@/components/auth/PortalGuard';

export default function LeadershipLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGuard requiredPortal="leadership">
      <AppShell role="leadership">{children}</AppShell>
    </PortalGuard>
  );
}
