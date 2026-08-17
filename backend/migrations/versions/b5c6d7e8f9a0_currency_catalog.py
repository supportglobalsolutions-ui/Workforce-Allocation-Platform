"""Payout currency catalog, seeded from country currencies plus USD and GBP.

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-08-17 16:30:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, None] = "a4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Display names for codes we can seed without an external lookup.
KNOWN_NAMES = {
    "USD": "US Dollar",
    "GBP": "British Pound",
    "EUR": "Euro",
    "KES": "Kenyan Shilling",
    "UGX": "Ugandan Shilling",
    "TZS": "Tanzanian Shilling",
    "NGN": "Nigerian Naira",
    "GHS": "Ghanaian Cedi",
    "ZAR": "South African Rand",
    "RWF": "Rwandan Franc",
    "INR": "Indian Rupee",
    "PHP": "Philippine Peso",
    "CAD": "Canadian Dollar",
    "AUD": "Australian Dollar",
}


def upgrade() -> None:
    op.create_table(
        "currencies",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("code", sa.String(length=3), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("symbol", sa.String(length=8), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("code", name="uq_currencies_code"),
    )

    conn = op.get_bind()
    codes = {row[0] for row in conn.execute(sa.text("SELECT DISTINCT currency_code FROM countries")) if row[0]}
    codes.update(
        row[0]
        for row in conn.execute(sa.text("SELECT DISTINCT quote_currency FROM fx_rates"))
        if row[0]
    )
    codes.update(("USD", "GBP"))

    for code in sorted(codes):
        conn.execute(
            sa.text(
                "INSERT INTO currencies (code, name) VALUES (:code, :name)"
                " ON CONFLICT (code) DO NOTHING"
            ),
            {"code": code, "name": KNOWN_NAMES.get(code, code)},
        )


def downgrade() -> None:
    op.drop_table("currencies")
