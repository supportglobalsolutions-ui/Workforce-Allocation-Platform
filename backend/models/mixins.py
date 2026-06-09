from sqlalchemy import Column, DateTime, text
from sqlalchemy.dialects.postgresql import TIMESTAMPTZ


class TimestampMixin:
    """Adds created_at and updated_at TIMESTAMPTZ columns."""
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=text("now()"))
    updated_at = Column(TIMESTAMPTZ, nullable=False, server_default=text("now()"), onupdate=text("now()"))


class CreatedAtMixin:
    """Adds only created_at — for append-only tables."""
    created_at = Column(TIMESTAMPTZ, nullable=False, server_default=text("now()"))
