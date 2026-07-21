import { NextRequest, NextResponse } from 'next/server';

type Role = 'user' | 'partner' | 'admin' | 'super_admin';

// Which roles may enter each portal prefix
const PORTAL_ROLES: Record<string, Role[]> = {
  '/worker':     ['user', 'partner', 'admin', 'super_admin'],
  '/admin':      ['admin', 'super_admin'],
  '/leadership': ['super_admin'],
};

// Where each role lands after a successful login
const ROLE_LANDING: Record<Role, string> = {
  user:        '/worker/dashboard',
  partner:     '/worker/dashboard',
  admin:       '/admin/dashboard',
  super_admin: '/leadership/ceo-command',
};

function getRole(req: NextRequest): Role | null {
  const cookie = req.cookies.get('gs-role')?.value;
  if (cookie === 'user' || cookie === 'partner' || cookie === 'admin' || cookie === 'super_admin') {
    return cookie;
  }
  return null;
}

function matchedPortal(pathname: string): string | null {
  for (const prefix of Object.keys(PORTAL_ROLES)) {
    if (pathname.startsWith(prefix)) return prefix;
  }
  return null;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const portal = matchedPortal(pathname);

  // Not a protected route — let it through
  if (!portal) return NextResponse.next();

  const role = getRole(req);

  // No session — redirect to login
  if (!role) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Wrong portal for this role — redirect to their home
  if (!PORTAL_ROLES[portal].includes(role)) {
    const url = req.nextUrl.clone();
    url.pathname = ROLE_LANDING[role];
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/worker/:path*', '/admin/:path*', '/leadership/:path*'],
};
