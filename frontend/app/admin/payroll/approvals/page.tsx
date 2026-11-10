import { redirect } from 'next/navigation';

/** Monthly approvals now live on the Workers page; old links land there. */
export default function MonthlyApprovalsRedirect() {
  redirect('/admin/workers');
}
