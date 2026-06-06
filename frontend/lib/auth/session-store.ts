'use client';

import {
  AUTH_COOKIE,
  AUTH_STORAGE_KEY,
  AuthSession,
  clearSessionCookie,
  parseSession,
  serializeSession,
  setSessionCookie,
} from './config';

const SESSION_EVENT = 'gs-session-change';

export function readStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;

  const fromStorage = parseSession(localStorage.getItem(AUTH_STORAGE_KEY));
  if (fromStorage) return fromStorage;

  const match = document.cookie.match(
    new RegExp(`(?:^|; )${AUTH_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`)
  );
  if (match) return parseSession(decodeURIComponent(match[1]));

  return null;
}

export function writeStoredSession(session: AuthSession | null) {
  if (typeof window === 'undefined') return;

  if (session) {
    localStorage.setItem(AUTH_STORAGE_KEY, serializeSession(session));
    setSessionCookie(session);
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    clearSessionCookie();
  }

  // Invalidate snapshot cache so the next getSessionSnapshot read is fresh
  _cachedRaw = undefined;

  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function subscribeSession(onChange: () => void) {
  window.addEventListener(SESSION_EVENT, onChange);
  return () => window.removeEventListener(SESSION_EVENT, onChange);
}

let _cachedRaw: string | null | undefined = undefined;
let _cachedSession: AuthSession | null = null;

export function getSessionSnapshot(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (raw === _cachedRaw) return _cachedSession;
  _cachedRaw = raw;
  _cachedSession = parseSession(raw);
  return _cachedSession;
}

export function getSessionServerSnapshot(): AuthSession | null {
  return null;
}
