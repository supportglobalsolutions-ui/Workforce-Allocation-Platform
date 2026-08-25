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
