import { FirebaseError } from 'firebase/app';

export function getFirebaseAuthErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-email':
        return 'Invalid email or password.';
      case 'auth/user-disabled':
        return 'Your account is awaiting admin approval or has been disabled.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Try again later.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      default:
        return err.message || 'Authentication failed.';
    }
  }

  const raw = err instanceof Error ? err.message : '';
  if (raw.includes('user-disabled')) {
    return 'Your account is awaiting admin approval or has been disabled.';
  }
  if (raw.includes('EMAIL_EXISTS') || raw.includes('email-already-in-use')) {
    return 'An account with this email already exists.';
  }

  return raw || 'Something went wrong. Please try again.';
}
