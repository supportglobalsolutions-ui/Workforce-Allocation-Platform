import PortalGuard from '@/components/auth/PortalGuard';
import WorkerChrome from '@/components/navigation/WorkerChrome';

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGuard requiredPortal="worker">
      <WorkerChrome>{children}</WorkerChrome>
    </PortalGuard>
  );
}
