import { redirect } from 'next/navigation';

/** Shared costs now live on the Ledger page; old links land there. */
export default function SharedCostsRedirect() {
  redirect('/admin/payroll/month-data?tab=shared-costs');
}
