import { redirect } from 'next/navigation';

/** Client splits are edited on the Client Ledger with the Client split toggle on; old links land there. */
export default function ClientSplitsRedirect() {
  redirect('/admin/clients/ledger?split=1');
}
