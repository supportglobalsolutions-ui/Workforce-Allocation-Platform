/**
 * Typed fetch client for the FastAPI backend.
 * All requests go through the Next.js /api reverse proxy (next.config.js rewrites).
 * Every call automatically attaches the Firebase ID token as a Bearer header.
 */
import { auth } from '@/lib/firebase';

const BASE = '/api';
const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';

async function getToken(forceRefresh = false): Promise<string | null> {
  // In test mode the backend supplies the fixed development identity.
  // Avoid contacting Firebase, so a suspended Firebase project cannot block
  // PostgreSQL-backed admin pages.
  if (DEV_AUTH_BYPASS) return null;

  await auth.authStateReady();
  return auth.currentUser?.getIdToken(forceRefresh) ?? null;
}


async function parseErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  const trimmed = text.trim();
  const proxyFailure =
    !trimmed
    || /^internal server error$/i.test(trimmed)
    || /^<!doctype/i.test(trimmed)
    || /^<html/i.test(trimmed);

  if (trimmed && !proxyFailure) {
    try {
      const json = JSON.parse(text) as { detail?: string | { msg: string }[] };
      if (typeof json.detail === 'string') return json.detail;
      if (Array.isArray(json.detail)) {
        return json.detail.map((d) => d.msg).join(', ');
      }
    } catch {
      if (text.length < 300) return text;
    }
  }

  if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504 || proxyFailure) {
    return 'Cannot reach the API server. If it is restarting, wait a moment and retry. Start it with: cd backend && python -m uvicorn main:app --reload --port 8000';
  }

  return `Request failed (${res.status})`;
}

function isRetryable(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const fetchWith = async (forceRefresh: boolean) => {
    const token = await getToken(forceRefresh);
    return fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  };

  const attempt = async (forceRefresh: boolean) => {
    try {
      return await fetchWith(forceRefresh);
    } catch {
      throw new Error(
        'Cannot reach the API server. Start the backend: cd backend && python -m uvicorn main:app --reload --port 8000',
      );
    }
  };

  let res: Response;
  try {
    res = await attempt(false);
  } catch (first) {
    if (method !== 'GET') throw first;
    await new Promise((r) => setTimeout(r, 600));
    res = await attempt(false);
  }

  // On 401, force-refresh the token and retry once.
  if (res.status === 401) {
    res = await attempt(true);
  }

  // Uvicorn --reload drops connections for a second; retry once so a page
  // load during a backend restart is not a hard failure.
  if (isRetryable(res.status) && method === 'GET') {
    await new Promise((r) => setTimeout(r, 600));
    res = await attempt(false);
  }

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string)                    => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown)     => request<T>('POST',   path, body),
  patch:  <T>(path: string, body: unknown)     => request<T>('PATCH',  path, body),
  put:    <T>(path: string, body: unknown)     => request<T>('PUT',    path, body),
  delete: <T>(path: string)                    => request<T>('DELETE', path),
};
