import AppShell from '@/components/navigation/AppShell';

export default function WorkerShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="worker">{children}</AppShell>;
}
