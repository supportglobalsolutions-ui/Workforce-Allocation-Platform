import { redirect } from 'next/navigation';

/**
 * Live monitoring merged into the Sessions page as a view switch. Kept as a
 * redirect so existing links and bookmarks still land in the right place.
 */
export default function LiveSessionsRedirect() {
  redirect('/admin/sessions?view=live');
}
