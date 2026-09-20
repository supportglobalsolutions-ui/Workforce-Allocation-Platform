"""Validation helpers for worker mobile-money payout identity fields.

Invalid characters are stripped silently; oversized values are truncated.
Callers should not surface character-rule messages to end users.
"""
from __future__ import annotations

import re

MM_NAME_MAX = 60
MM_PROVIDER_MAX = 32

_INVALID_CHARS = re.compile(r"[^A-Za-z0-9 ]+")


def normalize_mm_text(value: str | None, *, max_len: int) -> str | None:
    """Strip special chars, collapse spaces, truncate. Empty → None."""
    if value is None:
        return None
    text = _INVALID_CHARS.sub("", str(value))
    text = " ".join(text.split())
    if not text:
        return None
    return text[:max_len]


def normalize_mobile_money_name(value: str | None) -> str | None:
    return normalize_mm_text(value, max_len=MM_NAME_MAX)


def normalize_mobile_money_provider(value: str | None) -> str | None:
    return normalize_mm_text(value, max_len=MM_PROVIDER_MAX)
