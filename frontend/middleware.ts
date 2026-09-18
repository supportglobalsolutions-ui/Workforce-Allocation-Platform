import { NextRequest, NextResponse } from 'next/server';

type Role = 'user' | 'partner' | 'admin' | 'executive' | 'super_admin';

// Must mirror ROLE_ALLOWED_PORTALS in lib/auth/config.ts. This is the guard
// that actually blocks a URL typed into the address bar.
const PORTAL_ROLES: Record<string, Role[]> = {
  // Staff claim/connect desktops via the worker RDP board (docs §1.3).
  '/worker': ['user', 'partner', 'admin', 'executive', 'super_admin'],
  '/admin': ['admin', 'super_admin'],
  // Executives live here and nowhere else (except worker RDP above).
  '/leadership': ['executive', 'super_admin'],
};

const ROLE_LANDING: Record<Role, string> = {
  user: '/worker/dashboard',
  partner: '/worker/dashboard',
  admin: '/admin/dashboard',
  executive: '/leadership/ceo-command',
  super_admin: '/leadership/ceo-command',
};

const PORTAL_LANDING: Record<string, string> = {
  '/worker': '/worker/dashboard',
  '/admin': '/admin/dashboard',
  '/leadership': '/leadership/ceo-command',
};

const VALID_ROLES = new Set<Role>(['user', 'partner', 'admin', 'executive', 'super_admin']);

function cookieSecret(): string {
  return (
    process.env.SESSION_COOKIE_SECRET
    || process.env.OTP_PEPPER
    || (process.env.NODE_ENV === 'production' ? '' : 'dev-session-cookie-secret')
  );
}

function decodePayload(token: string): string | null {
  try {
    const pad = '='.repeat((4 - (token.length % 4)) % 4);
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifySessionCookie(token: string | undefined): Promise<Role | null> {
  if (!token) return null;
  const secret = cookieSecret();
  if (!secret) return null;

  const raw = decodePayload(token);
  if (!raw) return null;

  const parts = raw.split('|');
  if (parts.length !== 4) return null;
  const [uid, role, expStr, sig] = parts;
  if (!uid || !VALID_ROLES.has(role as Role)) return null;

  const payload = `${uid}|${role}|${expStr}`;
  const expected = await hmacSha256Hex(secret, payload);
  if (sig.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < sig.length; i += 1) {
    mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;

  return role as Role;
}

function matchedPortal(pathname: string): string | null {
  for (const prefix of Object.keys(PORTAL_ROLES)) {
    if (pathname.startsWith(prefix)) return prefix;
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const portal = matchedPortal(pathname);

  if (!portal) return NextResponse.next();

  const stripped = pathname.replace(/\/$/, '');
  if (stripped === portal) {
    const url = req.nextUrl.clone();
    url.pathname = PORTAL_LANDING[portal];
    return NextResponse.redirect(url);
  }

  const role = await verifySessionCookie(req.cookies.get('gs-session')?.value);

  if (!role) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

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
