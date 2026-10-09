import { redirect } from 'next/navigation';

/** Shared costs now live on the Ledger page; old links land there. */
export default function SharedCostsRedirect() {
  redirect('/admin/payroll/ledger?tab=shared-costs');
}
