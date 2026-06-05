import AppShell from '@/components/navigation/AppShell';

export default function LeadershipLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="leadership">{children}</AppShell>;
}
