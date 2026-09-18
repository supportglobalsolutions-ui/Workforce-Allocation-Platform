"""E.164 phone dial codes and validation (mirrors frontend/lib/phone-country-codes.ts)."""

from __future__ import annotations

import re

# (country name, ISO, dial digits)
PHONE_DIAL_CODES: list[tuple[str, str, str]] = [
    ("Kenya", "KE", "254"),
    ("Uganda", "UG", "256"),
    ("Tanzania", "TZ", "255"),
    ("Rwanda", "RW", "250"),
    ("Ethiopia", "ET", "251"),
    ("Nigeria", "NG", "234"),
    ("Ghana", "GH", "233"),
    ("South Africa", "ZA", "27"),
    ("Egypt", "EG", "20"),
    ("Morocco", "MA", "212"),
    ("United Kingdom", "GB", "44"),
    ("United States", "US", "1"),
    ("Canada", "CA", "1"),
    ("India", "IN", "91"),
    ("Pakistan", "PK", "92"),
    ("Philippines", "PH", "63"),
    ("United Arab Emirates", "AE", "971"),
    ("Saudi Arabia", "SA", "966"),
    ("Germany", "DE", "49"),
    ("France", "FR", "33"),
    ("Netherlands", "NL", "31"),
    ("Australia", "AU", "61"),
    ("Brazil", "BR", "55"),
    ("China", "CN", "86"),
    ("Japan", "JP", "81"),
    ("South Korea", "KR", "82"),
    ("Singapore", "SG", "65"),
    ("Malaysia", "MY", "60"),
    ("Indonesia", "ID", "62"),
    ("Turkey", "TR", "90"),
    ("Poland", "PL", "48"),
    ("Spain", "ES", "34"),
    ("Italy", "IT", "39"),
    ("Portugal", "PT", "351"),
    ("Ireland", "IE", "353"),
    ("Sweden", "SE", "46"),
    ("Norway", "NO", "47"),
    ("Denmark", "DK", "45"),
    ("Finland", "FI", "358"),
    ("Belgium", "BE", "32"),
    ("Switzerland", "CH", "41"),
    ("Austria", "AT", "43"),
    ("Mexico", "MX", "52"),
    ("Argentina", "AR", "54"),
    ("Colombia", "CO", "57"),
    ("Chile", "CL", "56"),
    ("Peru", "PE", "51"),
    ("New Zealand", "NZ", "64"),
    ("Israel", "IL", "972"),
    ("Qatar", "QA", "974"),
    ("Kuwait", "KW", "965"),
    ("Bahrain", "BH", "973"),
    ("Oman", "OM", "968"),
    ("Jordan", "JO", "962"),
    ("Lebanon", "LB", "961"),
    ("Zambia", "ZM", "260"),
    ("Zimbabwe", "ZW", "263"),
    ("Botswana", "BW", "267"),
    ("Namibia", "NA", "264"),
    ("Malawi", "MW", "265"),
    ("Mozambique", "MZ", "258"),
    ("Cameroon", "CM", "237"),
    ("Senegal", "SN", "221"),
    ("Ivory Coast", "CI", "225"),
    ("DR Congo", "CD", "243"),
    ("Sudan", "SD", "249"),
    ("Somalia", "SO", "252"),
    ("Burundi", "BI", "257"),
    ("South Sudan", "SS", "211"),
]

_DIAL_SET = {d for _, _, d in PHONE_DIAL_CODES}
_DIALS_LONGEST = sorted(_DIAL_SET, key=len, reverse=True)

PHONE_UPDATE_TITLE = "Update your phone number"
PHONE_UPDATE_MESSAGE = (
    "Please update your phone number to include your country code "
    "(for example Kenya: +254714516132). Open Profile, choose your country code "
    "from the dropdown, and save the correct number."
)


def normalize_e164(value: object) -> str:
    compact = re.sub(r"[\s\-().]", "", str(value or "").strip())
    if not compact or compact == "+":
        raise ValueError("Phone number is required.")
    if not compact.startswith("+"):
        raise ValueError("Phone must include a country code (select from the list).")
    digits = compact[1:]
    if not digits:
        raise ValueError("Phone number is required.")
    if not re.fullmatch(r"[0-9]{8,15}", digits):
        raise ValueError("Phone must be 8–15 digits including the country code.")
    matched_dial: str | None = None
    national = ""
    for dial in _DIALS_LONGEST:
        if digits.startswith(dial):
            matched_dial = dial
            national = digits[len(dial) :]
            break
    if not matched_dial:
        raise ValueError("Select a valid country code from the list.")
    if not national:
        raise ValueError("Phone number is required.")
    if len(national) < 4 or len(national) > 12:
        raise ValueError("Enter the rest of your phone number after the country code.")
    if national.startswith("0"):
        raise ValueError("Do not include a leading 0 after the country code.")
    return f"+{digits}"


def phone_needs_country_code_update(phone: str | None) -> bool:
    if not phone or not str(phone).strip():
        return True
    try:
        normalize_e164(phone)
        return False
    except ValueError:
        return True
