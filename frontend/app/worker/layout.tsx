import AppShell from '@/components/navigation/AppShell';

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="worker">{children}</AppShell>;
}
