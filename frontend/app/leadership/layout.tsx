import DashboardLayout from '@/components/shared/DashboardLayout';

export default function LeadershipLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout role="leadership">{children}</DashboardLayout>;
}
