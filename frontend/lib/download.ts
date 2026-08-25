/**
 * Authenticated file download helper for CSV / PDF / ZIP endpoints.
 * Attaches the Firebase bearer token, fetches through the /api proxy,
 * and triggers a browser download of the resulting blob.
 */
import { auth } from '@/lib/firebase';

const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';

async function authHeaders(): Promise<HeadersInit> {
  if (DEV_AUTH_BYPASS) return {};
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchAuthenticatedBlob(path: string): Promise<Blob> {
  const res = await fetch(`/api${path}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await fetchAuthenticatedBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function objectUrlForFile(path: string): Promise<string> {
  const blob = await fetchAuthenticatedBlob(path);
  return URL.createObjectURL(blob);
}
