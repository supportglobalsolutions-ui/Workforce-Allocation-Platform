export function getAuthErrorMessage(err: unknown): string {
  if (!err) return 'Something went wrong. Please try again.';
  const raw = err instanceof Error ? err.message : String(err);

  const lower = raw.toLowerCase();
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid credentials') ||
    lower.includes('wrong-password') ||
    lower.includes('invalid email or password')
  ) {
    return 'Invalid email or password.';
  }
  if (
    lower.includes('user-disabled') ||
    lower.includes('banned') ||
    lower.includes('awaiting admin approval')
  ) {
    return 'Your account is awaiting admin approval or has been disabled.';
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'Too many attempts. Try again later.';
  }
  if (
    lower.includes('already registered') ||
    lower.includes('email-already-in-use') ||
    lower.includes('email already exists') ||
    lower.includes('user already registered')
  ) {
    return 'An account with this email already exists.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address.';
  }

  return raw || 'Something went wrong. Please try again.';
}
