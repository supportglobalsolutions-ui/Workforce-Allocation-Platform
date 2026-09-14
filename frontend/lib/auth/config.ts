import { PortalRole } from '@/lib/navigation/config';

export type AuthRole = 'user' | 'partner' | 'admin' | 'executive' | 'super_admin';

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
  partner: 'worker',
  admin: 'admin',
  executive: 'leadership',
  super_admin: 'leadership',
};

/**
 * Which portals each role may open. A role with a single entry gets no
 * workspace switcher — there is nowhere else to go.
 *
 * Only super_admin spans all three. An executive is confined to leadership;
 * an admin to the admin portal.
 */
export const ROLE_ALLOWED_PORTALS: Record<AuthRole, PortalRole[]> = {
  user: ['worker'],
  partner: ['worker'],
  admin: ['admin'],
  executive: ['leadership'],
  super_admin: ['leadership', 'admin', 'worker'],
};

export const ROLE_DISPLAY: Record<AuthRole, string> = {
  user: 'Worker',
  partner: 'Partner',
  admin: 'Operations Lead',
  executive: 'Executive',
  super_admin: 'Super Admin',
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
  // Only a super admin may hand out leadership access.
  if (actorRole === 'super_admin') {
    return ['user', 'partner', 'admin', 'executive', 'super_admin'];
  }
  if (actorRole === 'admin') return ['user', 'partner', 'admin'];
  return [];
}
