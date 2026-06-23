import { PortalRole } from '@/lib/navigation/config';

export type AuthRole = 'user' | 'admin' | 'super_admin';

export interface AuthSession {
  uid: string;
  email: string;
  displayName: string;
  authRole: AuthRole;
  primaryPortal: PortalRole;
  allowedPortals: PortalRole[];
}

export const SUPER_ADMIN_EMAIL = 'support.globalsolutions@gmail.com';

export const ROLE_TO_PORTAL: Record<AuthRole, PortalRole> = {
  user: 'worker',
  admin: 'admin',
  super_admin: 'leadership',
};

export const ROLE_ALLOWED_PORTALS: Record<AuthRole, PortalRole[]> = {
  user: ['worker'],
  admin: ['admin', 'worker'],
  super_admin: ['leadership', 'admin', 'worker'],
};

export const ROLE_DISPLAY: Record<AuthRole, string> = {
  user: 'User',
  admin: 'Admin',
  super_admin: 'Super Admin / Executive',
};

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

/** Returns which roles the actor is allowed to assign when creating/elevating accounts. */
export function assignableRoles(actorRole: AuthRole): AuthRole[] {
  if (actorRole === 'super_admin') return ['user', 'admin', 'super_admin'];
  if (actorRole === 'admin') return ['user'];
  return [];
}
