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

export async function syncSessionCookie(idToken: string): Promise<Role | null> {
  const backend = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  const res = await fetch(`${backend}/auth/session-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) return null;
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
