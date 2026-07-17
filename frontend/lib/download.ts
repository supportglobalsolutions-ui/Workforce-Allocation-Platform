/**
 * Authenticated file download helper for CSV / PDF / ZIP endpoints.
 * Attaches the Firebase bearer token, fetches through the /api proxy,
 * and triggers a browser download of the resulting blob.
 */
import { auth } from '@/lib/firebase';

export async function downloadFile(path: string, filename: string): Promise<void> {
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
