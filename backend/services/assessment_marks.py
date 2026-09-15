"""Marks on a sitting must total exactly 100 before workers can take it."""
from decimal import Decimal
from typing import Sequence

from fastapi import HTTPException

HUNDRED = Decimal("100.00")
TWO_DP = Decimal("0.01")


def marks_total(values: Sequence[Decimal | int | float | str | None]) -> Decimal:
    total = Decimal("0")
    for v in values:
        if v is None:
            continue
        total += Decimal(str(v))
    return total.quantize(TWO_DP)


def require_marks_total_100(values: Sequence[Decimal | int | float | str | None], label: str) -> None:
    total = marks_total(values)
    if total != HUNDRED:
        raise HTTPException(
            status_code=400,
            detail=f"{label} marks must add up to 100 (currently {total}).",
        )


def max_attempts_for(allow_retakes: bool, max_attempts: int) -> int:
    if not allow_retakes:
        return 1
    return max(1, int(max_attempts or 1))


def retakes_allowed_for(allow_retakes: bool, max_attempts: int) -> int:
    return max(0, max_attempts_for(allow_retakes, max_attempts) - 1)


def attempts_exhausted_detail(allow_retakes: bool, max_attempts: int) -> str:
    n = retakes_allowed_for(allow_retakes, max_attempts)
    if n <= 0:
        return "No retakes allowed. You have already used your one attempt on this test."
    if n == 1:
        return "Only 1 retake is allowed. You have used it."
    return f"Only {n} retakes are allowed. You have used them all."


def attempt_progress(allow_retakes: bool, max_attempts: int, used: int) -> dict:
    cap = max_attempts_for(allow_retakes, max_attempts)
    used_n = max(0, int(used or 0))
    remaining = max(0, cap - used_n)
    retakes_cap = retakes_allowed_for(allow_retakes, max_attempts)
    return {
        "cap": cap,
        "used": used_n,
        "remaining": remaining,
        "retakes_allowed": retakes_cap,
        "retakes_remaining": max(0, remaining - (0 if used_n else 1)) if remaining else 0,
        "can_attempt": used_n < cap,
        "blocked_reason": None if used_n < cap else attempts_exhausted_detail(allow_retakes, max_attempts),
    }
