/**
 * Typed fetch client for the FastAPI backend.
 * All requests go through the Next.js /api reverse proxy (next.config.js rewrites).
 * Every call automatically attaches the Firebase ID token as a Bearer header.
 */
import { auth } from '@/lib/firebase';

const BASE = '/api';

async function getToken(): Promise<string | null> {
  return auth.currentUser?.getIdToken() ?? null;
}

async function headers(extra?: HeadersInit): Promise<HeadersInit> {
  const token = await getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function parseErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');

  if (text) {
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

  if (res.status === 500 || res.status === 502 || res.status === 503) {
    return 'Cannot reach the API server. Start the backend: cd backend && python -m uvicorn main:app --port 8000';
  }

  return `Request failed (${res.status})`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: await headers(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(
      'Cannot reach the API server. Start the backend: cd backend && python -m uvicorn main:app --port 8000',
    );
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
