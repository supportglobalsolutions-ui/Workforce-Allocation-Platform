import { redirect } from 'next/navigation';
export default function OldMonthDataPage({ searchParams }: { searchParams: { period?: string } }) {
  redirect(`/admin/payroll/month-data${searchParams.period ? `?period=${encodeURIComponent(searchParams.period)}` : ''}`);
}
