import AppShell from '@/components/navigation/AppShell';
import PortalGuard from '@/components/auth/PortalGuard';
import EmailSendMonitor from '@/components/admin/EmailSendMonitor';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGuard requiredPortal="admin">
      <AppShell role="admin">{children}</AppShell>
      <EmailSendMonitor />
    </PortalGuard>
  );
}
