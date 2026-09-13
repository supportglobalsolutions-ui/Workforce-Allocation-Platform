import { createHmac, timingSafeEqual } from 'crypto';

type Role = 'user' | 'partner' | 'admin' | 'super_admin';
const VALID_ROLES = new Set<Role>(['user', 'partner', 'admin', 'super_admin']);

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
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

export function verifySessionCookie(token: string | undefined | null): { uid: string; role: Role } | null {
  if (!token) return null;
  const secret = cookieSecret();
  if (!secret) return null;

  const raw = decodePayload(token);
  if (!raw) return null;

  const parts = raw.split('|');
  if (parts.length !== 4) return null;
  const [uid, role, expStr, sig] = parts;
  if (!VALID_ROLES.has(role as Role)) return null;

  const payload = `${uid}|${role}|${expStr}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;

  return { uid, role: role as Role };
}

export class LoginOtpRequiredError extends Error {
  constructor() {
    super('login_otp_required');
    this.name = 'LoginOtpRequiredError';
  }
}

export async function syncSessionCookie(idToken: string): Promise<Role | null> {
  // Go through the same-origin /api rewrite rather than hitting the backend
  // directly. A direct call to NEXT_PUBLIC_API_URL is cross-origin from the
  // page, so the CSP connect-src ('self' + supabase) blocks it before the
  // request is even sent — which surfaces as a bare "Failed to fetch".
  // The rewrite in next.config.js forwards /api/* to the backend, and
  // app/api/auth/session/route.ts still wins for its own path because
  // filesystem routes take precedence over afterFiles rewrites.
  const res = await fetch('/api/auth/session-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { detail?: string };
      detail = body.detail ?? '';
    } catch {
      /* ignore */
    }
    if (res.status === 403 && detail === 'login_otp_required') {
      throw new LoginOtpRequiredError();
    }
    return null;
  }
  const data = (await res.json()) as { token?: string; role?: Role };
  if (!data.token || !data.role) return null;

  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: data.token }),
  });

  return data.role;
}

export async function clearSessionCookie(): Promise<void> {
  await fetch('/api/auth/session', { method: 'DELETE' });
}
