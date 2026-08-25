import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'gs-session';
const ONE_DAY = 60 * 60 * 24;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { token?: string };
  if (!body.token) {
    return NextResponse.json({ detail: 'Missing token' }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: body.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_DAY,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
