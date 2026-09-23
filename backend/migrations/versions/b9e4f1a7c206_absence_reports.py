"""Absence reports — workers flagging shifts they cannot attend.

Revision ID: b9e4f1a7c206
Revises: c0d1e2f3a4b5
Create Date: 2026-09-22

``shift_id`` is nullable on purpose: a worker can declare a date range before
any shift exists for it. Evidence is optional, so ``attachment_paths`` starts
empty and only ``reason_text`` is NOT NULL.

Enum types use create_type=False + idempotent CREATE TYPE so a re-run (or
types left behind by SQLAlchemy metadata) does not fail with DuplicateObject.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b9e4f1a7c206"
down_revision: Union[str, None] = "c0d1e2f3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# create_type=False: we create enums ourselves; otherwise create_table retries CREATE TYPE.
ABSENCE_REASON = postgresql.ENUM(
    "illness",
    "family_emergency",
    "bereavement",
    "power_outage",
    "internet_outage",
    "transport",
    "other",
    name="absence_reason_enum",
    create_type=False,
)

ABSENCE_STATUS = postgresql.ENUM(
    "pending",
    "accepted",
    "declined",
    "withdrawn",
    name="absence_status_enum",
    create_type=False,
)


def upgrade() -> None:
    for name, values in [
        (
            "absence_reason_enum",
            "'illness', 'family_emergency', 'bereavement', 'power_outage', "
            "'internet_outage', 'transport', 'other'",
        ),
        (
            "absence_status_enum",
            "'pending', 'accepted', 'declined', 'withdrawn'",
        ),
    ]:
        op.execute(f"""
            DO $$ BEGIN
                CREATE TYPE {name} AS ENUM ({values});
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """)

    op.create_table(
        "absence_reports",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "worker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workers.id"),
            nullable=False,
        ),
        sa.Column(
            "shift_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shifts.id"),
            nullable=True,
        ),
        sa.Column("absence_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("absence_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "reason_category",
            ABSENCE_REASON,
            nullable=False,
        ),
        sa.Column("reason_text", sa.Text(), nullable=False),
        sa.Column(
            "attachment_paths",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "status",
            ABSENCE_STATUS,
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "reviewed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("admin_users.id"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_absence_reports_worker_id", "absence_reports", ["worker_id"])
    op.create_index("ix_absence_reports_shift_id", "absence_reports", ["shift_id"])
    # The admin queue reads pending-first; the worker dashboard reads open rows.
    op.create_index("ix_absence_reports_status", "absence_reports", ["status"])


def downgrade() -> None:
    op.drop_index("ix_absence_reports_status", table_name="absence_reports")
    op.drop_index("ix_absence_reports_shift_id", table_name="absence_reports")
    op.drop_index("ix_absence_reports_worker_id", table_name="absence_reports")
    op.drop_table("absence_reports")
    op.execute("DROP TYPE IF EXISTS absence_status_enum")
    op.execute("DROP TYPE IF EXISTS absence_reason_enum")
