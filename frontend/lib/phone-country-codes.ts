/** Dial codes for phone number entry (E.164). Label shown in dropdowns. */

export interface PhoneDialCode {
  name: string;
  iso: string;
  dial: string; // digits only, no '+'
}

export const PHONE_DIAL_CODES: PhoneDialCode[] = [
  { name: 'Kenya', iso: 'KE', dial: '254' },
  { name: 'Uganda', iso: 'UG', dial: '256' },
  { name: 'Tanzania', iso: 'TZ', dial: '255' },
  { name: 'Rwanda', iso: 'RW', dial: '250' },
  { name: 'Ethiopia', iso: 'ET', dial: '251' },
  { name: 'Nigeria', iso: 'NG', dial: '234' },
  { name: 'Ghana', iso: 'GH', dial: '233' },
  { name: 'South Africa', iso: 'ZA', dial: '27' },
  { name: 'Egypt', iso: 'EG', dial: '20' },
  { name: 'Morocco', iso: 'MA', dial: '212' },
  { name: 'United Kingdom', iso: 'GB', dial: '44' },
  { name: 'United States', iso: 'US', dial: '1' },
  { name: 'Canada', iso: 'CA', dial: '1' },
  { name: 'India', iso: 'IN', dial: '91' },
  { name: 'Pakistan', iso: 'PK', dial: '92' },
  { name: 'Philippines', iso: 'PH', dial: '63' },
  { name: 'United Arab Emirates', iso: 'AE', dial: '971' },
  { name: 'Saudi Arabia', iso: 'SA', dial: '966' },
  { name: 'Germany', iso: 'DE', dial: '49' },
  { name: 'France', iso: 'FR', dial: '33' },
  { name: 'Netherlands', iso: 'NL', dial: '31' },
  { name: 'Australia', iso: 'AU', dial: '61' },
  { name: 'Brazil', iso: 'BR', dial: '55' },
  { name: 'China', iso: 'CN', dial: '86' },
  { name: 'Japan', iso: 'JP', dial: '81' },
  { name: 'South Korea', iso: 'KR', dial: '82' },
  { name: 'Singapore', iso: 'SG', dial: '65' },
  { name: 'Malaysia', iso: 'MY', dial: '60' },
  { name: 'Indonesia', iso: 'ID', dial: '62' },
  { name: 'Turkey', iso: 'TR', dial: '90' },
  { name: 'Poland', iso: 'PL', dial: '48' },
  { name: 'Spain', iso: 'ES', dial: '34' },
  { name: 'Italy', iso: 'IT', dial: '39' },
  { name: 'Portugal', iso: 'PT', dial: '351' },
  { name: 'Ireland', iso: 'IE', dial: '353' },
  { name: 'Sweden', iso: 'SE', dial: '46' },
  { name: 'Norway', iso: 'NO', dial: '47' },
  { name: 'Denmark', iso: 'DK', dial: '45' },
  { name: 'Finland', iso: 'FI', dial: '358' },
  { name: 'Belgium', iso: 'BE', dial: '32' },
  { name: 'Switzerland', iso: 'CH', dial: '41' },
  { name: 'Austria', iso: 'AT', dial: '43' },
  { name: 'Mexico', iso: 'MX', dial: '52' },
  { name: 'Argentina', iso: 'AR', dial: '54' },
  { name: 'Colombia', iso: 'CO', dial: '57' },
  { name: 'Chile', iso: 'CL', dial: '56' },
  { name: 'Peru', iso: 'PE', dial: '51' },
  { name: 'New Zealand', iso: 'NZ', dial: '64' },
  { name: 'Israel', iso: 'IL', dial: '972' },
  { name: 'Qatar', iso: 'QA', dial: '974' },
  { name: 'Kuwait', iso: 'KW', dial: '965' },
  { name: 'Bahrain', iso: 'BH', dial: '973' },
  { name: 'Oman', iso: 'OM', dial: '968' },
  { name: 'Jordan', iso: 'JO', dial: '962' },
  { name: 'Lebanon', iso: 'LB', dial: '961' },
  { name: 'Zambia', iso: 'ZM', dial: '260' },
  { name: 'Zimbabwe', iso: 'ZW', dial: '263' },
  { name: 'Botswana', iso: 'BW', dial: '267' },
  { name: 'Namibia', iso: 'NA', dial: '264' },
  { name: 'Malawi', iso: 'MW', dial: '265' },
  { name: 'Mozambique', iso: 'MZ', dial: '258' },
  { name: 'Cameroon', iso: 'CM', dial: '237' },
  { name: 'Senegal', iso: 'SN', dial: '221' },
  { name: 'Ivory Coast', iso: 'CI', dial: '225' },
  { name: 'DR Congo', iso: 'CD', dial: '243' },
  { name: 'Sudan', iso: 'SD', dial: '249' },
  { name: 'Somalia', iso: 'SO', dial: '252' },
  { name: 'Burundi', iso: 'BI', dial: '257' },
  { name: 'South Sudan', iso: 'SS', dial: '211' },
].sort((a, b) => a.name.localeCompare(b.name));

const DIAL_SET = new Set(PHONE_DIAL_CODES.map((c) => c.dial));

/** Longest-first so +254 matches before +2, etc. */
const DIALS_LONGEST = [...new Set(PHONE_DIAL_CODES.map((c) => c.dial))].sort(
  (a, b) => b.length - a.length,
);

export function dialCodeForCountryName(country: string): string {
  const match = PHONE_DIAL_CODES.find(
    (c) => c.name.toLowerCase() === country.trim().toLowerCase(),
  );
  return match?.dial ?? '254';
}

export function filterNationalNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, 12);
}

export function composeE164(dial: string, national: string): string {
  const d = dial.replace(/\D/g, '');
  let n = national.replace(/\D/g, '');
  // Drop a single leading 0 from national numbers (e.g. 0714… → 714…)
  if (n.startsWith('0')) n = n.slice(1);
  return `+${d}${n}`;
}

export function parseE164(phone: string): { dial: string; national: string } | null {
  const compact = phone.replace(/[^\d+]/g, '');
  if (!compact.startsWith('+')) return null;
  const digits = compact.slice(1);
  for (const dial of DIALS_LONGEST) {
    if (digits.startsWith(dial) && DIAL_SET.has(dial)) {
      return { dial, national: digits.slice(dial.length) };
    }
  }
  return null;
}

export function validateE164Phone(value: string): string {
  const compact = value.replace(/[^\d+]/g, '');
  if (!compact || compact === '+') {
    return 'Phone number is required.';
  }
  if (!compact.startsWith('+')) {
    return 'Select a country code and enter your number.';
  }
  const digits = compact.slice(1);
  if (!digits) {
    return 'Phone number is required.';
  }
  if (!/^[0-9]{8,15}$/.test(digits)) {
    return 'Phone must be 8–15 digits including the country code.';
  }
  const parsed = parseE164(compact);
  if (!parsed) {
    return 'Select a valid country code from the list.';
  }
  if (!parsed.national) {
    return 'Phone number is required.';
  }
  if (parsed.national.length < 4 || parsed.national.length > 12) {
    return 'Enter the rest of your phone number after the country code.';
  }
  if (parsed.national.startsWith('0')) {
    return 'Do not include a leading 0 after the country code.';
  }
  return '';
}

export function phoneNeedsCountryCodeUpdate(phone: string | null | undefined): boolean {
  if (!phone || !phone.trim()) return true;
  return Boolean(validateE164Phone(phone));
}
