"""Seed the currency and country catalogs.

Revision ID: c7d2e8b40915
Revises: b9e4f1a7c206
Create Date: 2026-09-23

``currency_for_country`` is meant to read the admin-managed ``countries``
table, falling back to a hardcoded map only until an operator adds the row.
In practice the table was never populated, so every lookup fell through to the
fallback and the catalog could not be used to correct anything — a worker in
the United Kingdom could not be mapped to GBP from the admin UI because there
was no row to edit.

This seeds both catalogs from the same list the fallback uses, so the database
is the source of truth from here on, and fills in the display symbols (KSh,
USh, £) that were all NULL.

Inserts are conditional on the row not already existing, so running this
against a database an operator has already curated changes nothing.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c7d2e8b40915"
down_revision: Union[str, None] = "b9e4f1a7c206"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


#: code, name, symbol
CURRENCIES = [
    ("USD", "US Dollar", "$"),
    ("GBP", "Pound Sterling", "£"),
    ("EUR", "Euro", "€"),
    ("KES", "Kenyan Shilling", "KSh"),
    ("UGX", "Ugandan Shilling", "USh"),
    ("TZS", "Tanzanian Shilling", "TSh"),
    ("RWF", "Rwandan Franc", "FRw"),
    ("ETB", "Ethiopian Birr", "Br"),
    ("NGN", "Nigerian Naira", "₦"),
    ("GHS", "Ghanaian Cedi", "₵"),
    ("ZAR", "South African Rand", "R"),
    ("ZMW", "Zambian Kwacha", "ZK"),
    ("MWK", "Malawian Kwacha", "MK"),
    ("INR", "Indian Rupee", "₹"),
]

#: country name, payout currency
COUNTRIES = [
    ("Kenya", "KES"),
    ("Uganda", "UGX"),
    ("Tanzania", "TZS"),
    ("Rwanda", "RWF"),
    ("Ethiopia", "ETB"),
    ("Nigeria", "NGN"),
    ("Ghana", "GHS"),
    ("South Africa", "ZAR"),
    ("Zambia", "ZMW"),
    # Zimbabwe is deliberately USD: the local unit is not one we pay out in.
    ("Zimbabwe", "USD"),
    ("Malawi", "MWK"),
    ("India", "INR"),
    ("United Kingdom", "GBP"),
    ("United States", "USD"),
]


def upgrade() -> None:
    conn = op.get_bind()

    for code, name, symbol in CURRENCIES:
        conn.execute(
            sa.text("""
                INSERT INTO currencies (code, name, symbol, is_active)
                VALUES (:code, :name, :symbol, true)
                ON CONFLICT (code) DO UPDATE
                    SET symbol = COALESCE(currencies.symbol, EXCLUDED.symbol)
            """),
            {"code": code, "name": name, "symbol": symbol},
        )

    for name, code in COUNTRIES:
        conn.execute(
            sa.text("""
                INSERT INTO countries (name, currency_code, is_active)
                VALUES (:name, :code, true)
                ON CONFLICT (name) DO NOTHING
            """),
            {"name": name, "code": code},
        )


def downgrade() -> None:
    """Remove only the seeded rows, and only where nothing has diverged.

    An operator may have edited a mapping after this ran; a blanket delete
    would silently discard that, so the down path matches on both columns.
    """
    conn = op.get_bind()
    for name, code in COUNTRIES:
        conn.execute(
            sa.text("DELETE FROM countries WHERE name = :name AND currency_code = :code"),
            {"name": name, "code": code},
        )
    for code, name, _symbol in CURRENCIES:
        conn.execute(
            sa.text("DELETE FROM currencies WHERE code = :code AND name = :name"),
            {"code": code, "name": name},
        )
