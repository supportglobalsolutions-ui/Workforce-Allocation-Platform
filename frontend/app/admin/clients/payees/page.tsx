import { redirect } from 'next/navigation';

export default function LegacyRecipientsPage({ searchParams }: { searchParams: { period?: string } }) {
  redirect(`/admin/clients/recipients${searchParams.period ? `?period=${encodeURIComponent(searchParams.period)}` : ''}`);
}
