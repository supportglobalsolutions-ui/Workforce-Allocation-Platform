export const NAME_MAX = 40;
export const PHONE_MAX_DIGITS = 15;
export const RESIDENCE_MAX = 80;
export const USERNAME_MAX = 32;
export const PASSWORD_LENGTH = 8;
export const EMAIL_MAX = 254;

const NAME_RE = /^[^\W\d_](?:[^\W\d_]|[ '\-]){1,39}$/u;
const RESIDENCE_RE = /^[^\W\d_](?:[^\W\d_]|[0-9 .,'\-]){1,79}$/u;
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignupField =
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'country'
  | 'residence'
  | 'username'
  | 'password'
  | 'confirmPassword';

export function filterName(value: string): string {
  return value.replace(/[^\p{L} '\-]/gu, '').slice(0, NAME_MAX);
}

export function filterPhone(value: string): string {
  const plus = value.trimStart().startsWith('+');
  const digits = value.replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS);
  return plus ? `+${digits}` : digits;
}

export function filterResidence(value: string): string {
  return value.replace(/[^\p{L}\p{N} .,'\-]/gu, '').slice(0, RESIDENCE_MAX);
}

export function filterUsername(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, USERNAME_MAX);
}

export function normalizePhone(value: string): string {
  return filterPhone(value);
}

export function validateEmail(value: string): string {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return 'Enter a valid email address, up to 254 characters.';
  }
  return '';
}

export function validateName(value: string, label: string): string {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!NAME_RE.test(text)) {
    return `${label} must be 2–40 letters. Spaces, hyphens, and apostrophes are allowed.`;
  }
  return '';
}

export function validatePhone(value: string): string {
  const compact = value.replace(/[^\d+]/g, '');
  if (!/^\+?[0-9]{8,15}$/.test(compact)) {
    return 'Use 8–15 digits. A leading + is allowed. Letters are not allowed.';
  }
  return '';
}

export function validateCountry(value: string, options: string[]): string {
  const text = value.trim();
  if (!text || (options.length > 0 && !options.includes(text))) {
    return 'Select a country from the list.';
  }
  return '';
}

export function validateResidence(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!RESIDENCE_RE.test(text)) {
    return 'Place of residence must be 2–80 letters or numbers.';
  }
  return '';
}

export function validateUsername(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (!USERNAME_RE.test(text)) {
    return 'Username must be 3–32 characters, start with a letter, and use only letters, numbers, and underscores.';
  }
  return '';
}

export function validatePassword(value: string): string {
  if (value.length !== PASSWORD_LENGTH) {
    return 'Password must be exactly 8 characters.';
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return 'Password must include a letter and a number.';
  }
  return '';
}

export function validateConfirmPassword(password: string, confirm: string): string {
  if (!confirm) return 'Re-enter your password.';
  if (password !== confirm) return 'Passwords do not match.';
  return '';
}
