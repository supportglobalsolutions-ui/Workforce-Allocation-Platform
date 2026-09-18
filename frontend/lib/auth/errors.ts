function rawAuthMessage(err: unknown): string {
  if (!err) return '';
  if (err instanceof Error) {
    const extra = err as Error & { code?: string; status?: number };
    return [extra.message, extra.code].filter(Boolean).join(' ').trim();
  }
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message || '').trim();
  }
  return String(err).trim();
}

/** Map auth/API failures to a short message the login UI can show. */
export function getAuthErrorMessage(err: unknown): string {
  const raw = rawAuthMessage(err);
  if (!raw) return 'Something went wrong. Please try again.';

  const lower = raw.toLowerCase();

  if (
    lower.includes('cannot reach the database')
    || lower.includes('database_url')
    || lower.includes('supabase pooler')
  ) {
    return 'Cannot reach the database right now. Check your connection and try again.';
  }

  if (
    lower.includes('cannot reach')
    || lower.includes('api server')
    || lower.includes('network')
    || lower.includes('failed to fetch')
    || lower.includes('having trouble connecting')
    || lower.includes('service unavailable')
  ) {
    return 'We’re having trouble connecting right now. Please wait a moment and try again.';
  }

  if (
    lower.includes('invalid login credentials')
    || lower.includes('invalid credentials')
    || lower.includes('invalid_credentials')
    || lower.includes('wrong-password')
    || lower.includes('invalid email or password')
    || lower === 'login failed'
  ) {
    return 'Invalid email or password.';
  }

  if (
    lower.includes('pending admin approval')
    || lower.includes('awaiting admin approval')
  ) {
    return 'Your account is pending admin approval. You can sign in after an administrator approves it.';
  }

  if (
    lower.includes('user_banned')
    || lower.includes('banned due')
    || (lower.includes('banned') && !lower.includes('pending'))
  ) {
    return 'Your account has been banned due to violating system rules. Contact an administrator for assistance.';
  }

  if (
    lower.includes('user-disabled')
    || lower.includes('user_disabled')
    || lower.includes('user is disabled')
    || lower.includes('user is banned')
  ) {
    return 'Your account is pending admin approval. You can sign in after an administrator approves it.';
  }

  if (lower.includes('login_otp_required')) {
    return 'Admin sign-in needs email verification. Please try again.';
  }

  if (lower.includes('workspace session') || lower.includes('sign-in is taking too long')) {
    return raw;
  }

  if (lower.includes('too many failed sign-in') || lower.includes('resend the verification code')) {
    return raw;
  }
  if (lower.includes('too many requests') || lower.includes('rate limit') || lower.includes('too many attempts')) {
    return 'Too many attempts. Please wait a little while before trying again.';
  }

  if (
    lower.includes('already registered')
    || lower.includes('email-already-in-use')
    || lower.includes('email already exists')
    || lower.includes('user already registered')
  ) {
    return 'An account with this email already exists.';
  }

  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address.';
  }

  if (lower.includes('session expired') || lower.includes('sign in again')) {
    return 'Your session expired. Please sign in again.';
  }

  // Keep deliberate user-facing API copy intact.
  if (
    raw.length <= 180
    && !lower.includes('traceback')
    && !lower.includes('exception')
    && !lower.includes('at http')
    && !/^error:/i.test(raw)
  ) {
    return raw;
  }

  return 'Something went wrong. Please try again.';
}
