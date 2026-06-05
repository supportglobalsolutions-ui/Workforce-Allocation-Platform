import { PortalRole } from '@/lib/navigation/config';

export type AuthRole = 'worker' | 'admin' | 'executive';

export interface AuthSession {
  email: string;
  authRole: AuthRole;
  primaryPortal: PortalRole;
  allowedPortals: PortalRole[];
}

export const AUTH_STORAGE_KEY = 'gs-session';
export const AUTH_COOKIE = 'gs-session';
export const DEMO_PASSWORD = '123456';

interface AccountConfig {
  password: string;
  authRole: AuthRole;
  primaryPortal: PortalRole;
  allowedPortals: PortalRole[];
  displayName: string;
}

export const DEMO_ACCOUNTS: Record<string, AccountConfig> = {
  'worker@globalsolutions.com': {
    password: DEMO_PASSWORD,
    authRole: 'worker',
    primaryPortal: 'worker',
    allowedPortals: ['worker'],
    displayName: 'Worker',
  },
  'admin@globalsolutions.com': {
    password: DEMO_PASSWORD,
    authRole: 'admin',
    primaryPortal: 'admin',
    allowedPortals: ['admin', 'worker'],
    displayName: 'Operations Lead',
  },
  'executive@globalsolutions.com': {
    password: DEMO_PASSWORD,
    authRole: 'executive',
    primaryPortal: 'leadership',
    allowedPortals: ['leadership', 'admin', 'worker'],
    displayName: 'Executive',
  },
};

export function authenticate(email: string, password: string): AuthSession | null {
  const normalized = email.trim().toLowerCase();
  const account = DEMO_ACCOUNTS[normalized];
  if (!account || account.password !== password) return null;

  return {
    email: normalized,
    authRole: account.authRole,
    primaryPortal: account.primaryPortal,
    allowedPortals: account.allowedPortals,
  };
}

export function canAccessPortal(session: AuthSession | null, portal: PortalRole): boolean {
  if (!session) return false;
  return session.allowedPortals.includes(portal);
}

export function portalFromPath(pathname: string): PortalRole | null {
  if (pathname.startsWith('/worker')) return 'worker';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/leadership')) return 'leadership';
  return null;
}

export function serializeSession(session: AuthSession): string {
  return JSON.stringify(session);
}

export function parseSession(raw: string | null | undefined): AuthSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as AuthSession;
    if (!data.email || !data.allowedPortals?.length) return null;
    return data;
  } catch {
    return null;
  }
}

export function setSessionCookie(session: AuthSession) {
  if (typeof document === 'undefined') return;
  const value = encodeURIComponent(serializeSession(session));
  document.cookie = `${AUTH_COOKIE}=${value}; path=/; max-age=86400; SameSite=Lax`;
}

export function clearSessionCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0`;
}
