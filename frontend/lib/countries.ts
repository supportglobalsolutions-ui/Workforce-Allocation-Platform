/**
 * Country names for the sign-up and profile pickers.
 *
 * The backend list (`/auth/register-countries`) is the source of truth; this
 * is the offline fallback so the field is never an empty dropdown when that
 * call fails.
 */
export function countryNameList(): string[] {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    const out: string[] = [];
    for (let i = 65; i <= 90; i += 1) {
      for (let j = 65; j <= 90; j += 1) {
        const code = String.fromCharCode(i) + String.fromCharCode(j);
        const name = names.of(code);
        if (name && name !== code) out.push(name);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  } catch {
    return ['Kenya', 'Uganda', 'Tanzania', 'Nigeria', 'Ghana', 'South Africa', 'United Kingdom', 'United States'];
  }
}
