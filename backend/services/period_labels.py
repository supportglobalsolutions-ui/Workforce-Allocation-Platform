"""Automatic payroll-period display names (always English Month Year)."""
import calendar
from datetime import date


def period_label_from_date(d: date) -> str:
    """e.g. date(2026, 3, 1) -> 'March 2026'."""
    return f"{calendar.month_name[d.month]} {d.year}"
