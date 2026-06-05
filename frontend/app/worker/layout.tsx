import DashboardLayout from '@/components/shared/DashboardLayout';

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout role="worker">{children}</DashboardLayout>;
}
