/**
 * Typed fetch client for the FastAPI backend.
 * All requests go through the Next.js /api reverse proxy (next.config.js rewrites).
 * Every call automatically attaches the Supabase access token as a Bearer header.
 */
import { supabase } from '@/lib/supabase';
import { AppError } from '@/lib/errors';

const BASE = '/api';
const SERVICE_UNAVAILABLE_MESSAGE = 'We’re having trouble connecting right now. Please wait a moment and try again.';

async function getToken(forceRefresh = false): Promise<string | null> {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}


interface ParsedError {
  /** Safe sentence for the interface. */
  friendly: string;
  /** Verbatim server detail — console only, never rendered. */
  raw: string;
  requestId?: string;
  debug?: unknown;
}

async function parseErrorMessage(res: Response): Promise<ParsedError> {
  const text = await res.text().catch(() => '');
  const trimmed = text.trim();
  const headerRequestId = res.headers.get('x-request-id') || undefined;
  let rawDetail = trimmed;
  let requestId = headerRequestId;
  let debug: unknown;
  const proxyFailure =
    !trimmed
    || /^internal server error$/i.test(trimmed)
    || /^<!doctype/i.test(trimmed)
    || /^<html/i.test(trimmed);

  if (trimmed && !proxyFailure) {
    try {
      const json = JSON.parse(text) as {
        detail?: string | { msg: string }[];
        request_id?: string;
        debug?: unknown;
      };
      requestId = json.request_id || headerRequestId;
      debug = json.debug;
      if (typeof json.detail === 'string') rawDetail = json.detail;
      else if (Array.isArray(json.detail)) rawDetail = json.detail.map((d) => d.msg).join(', ');
      // Backend messages are not shown verbatim unless they are deliberate,
      // user-actionable messages. This keeps internal implementation details
      // out of the interface.
      if (typeof json.detail === 'string') {
        const detail = json.detail.trim();
        if (detail) {
          return { friendly: detail, raw: rawDetail, requestId, debug };
        }
      }
      if (Array.isArray(json.detail)) {
        return {
          friendly: 'Please check the information you entered and try again.',
          raw: rawDetail, requestId, debug,
        };
      }
    } catch { /* use the safe status message below */ }
  }

  const wrap = (friendly: string): ParsedError => ({ friendly, raw: rawDetail || friendly, requestId, debug });

  if (res.status >= 500 || proxyFailure) return wrap(SERVICE_UNAVAILABLE_MESSAGE);
  if (res.status === 401) return wrap('Your session has expired. Please sign in again.');
  if (res.status === 403) return wrap('You do not have permission to do that.');
  if (res.status === 404) return wrap('We could not find what you requested.');
  if (res.status === 422) return wrap('Please check the information you entered and try again.');
  return wrap('We could not complete that request. Please try again.');
}

function isRetryable(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

/** Honour `Retry-After` seconds (or HTTP-date is ignored → undefined). */
function retryAfterHeaderMs(res: Response): number | undefined {
  const header = res.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.round(seconds * 1000);
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
    } catch (networkErr) {
      throw new AppError({
        friendly: SERVICE_UNAVAILABLE_MESSAGE,
        raw: networkErr instanceof Error ? networkErr.message : String(networkErr),
        url: `${BASE}${path}`,
        method,
      });
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
    const parsed = await parseErrorMessage(res);
    // Carries both audiences: .friendly for the UI, everything else for the
    // console via reportError().
    throw new AppError({
      friendly: parsed.friendly,
      raw: parsed.raw,
      status: res.status,
      requestId: parsed.requestId,
      debug: parsed.debug,
      url: `${BASE}${path}`,
      method,
      retryAfterMs: retryAfterHeaderMs(res),
    });
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
  /** Multipart upload — do not set Content-Type (browser sets the boundary). */
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const fetchWith = async (forceRefresh: boolean) => {
      const token = await getToken(forceRefresh);
      return fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });
    };
    let res = await fetchWith(false);
    if (res.status === 401) res = await fetchWith(true);
    if (!res.ok) {
      const parsed = await parseErrorMessage(res);
      throw new AppError({
        friendly: parsed.friendly,
        raw: parsed.raw,
        status: res.status,
        requestId: parsed.requestId,
        debug: parsed.debug,
        url: `${BASE}${path}`,
        method: 'POST',
        retryAfterMs: retryAfterHeaderMs(res),
      });
    }
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  },
};
