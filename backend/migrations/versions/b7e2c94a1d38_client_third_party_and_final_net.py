"""Client ledger: optional third party on the split, and an admin final net per party.

Revision ID: b7e2c94a1d38
Revises: b6e2a9c03d71
Create Date: 2026-10-10

The split rule becomes GS % + client % + third-party % = 100. Existing
agreements have no third party (0 %), so they still satisfy it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b7e2c94a1d38"
down_revision: Union[str, None] = "b6e2a9c03d71"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

AGREEMENTS = "client_revenue_agreements"
EARNINGS = "client_period_earnings"
SPLIT_CHECK = "ck_client_revenue_agreements_splits_sum"


def upgrade() -> None:
    op.add_column(AGREEMENTS, sa.Column("third_party_name", sa.String(120), nullable=True))
    op.add_column(AGREEMENTS, sa.Column("third_party_pct", sa.Numeric(5, 2), nullable=False, server_default="0"))
    op.drop_constraint(SPLIT_CHECK, AGREEMENTS, type_="check")
    op.create_check_constraint(SPLIT_CHECK, AGREEMENTS, "gs_pct + owner_pct + third_party_pct = 100.00")

    for name in ("third_party_share", "client_net_override", "gs_net_override", "third_party_net_override"):
        op.add_column(EARNINGS, sa.Column(name, sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    for name in ("third_party_net_override", "gs_net_override", "client_net_override", "third_party_share"):
        op.drop_column(EARNINGS, name)

    # Hand any third-party % back to GS so the two-way rule holds again.
    op.execute(f"UPDATE {AGREEMENTS} SET gs_pct = gs_pct + third_party_pct")
    op.drop_constraint(SPLIT_CHECK, AGREEMENTS, type_="check")
    op.create_check_constraint(SPLIT_CHECK, AGREEMENTS, "gs_pct + owner_pct = 100.00")
    op.drop_column(AGREEMENTS, "third_party_pct")
    op.drop_column(AGREEMENTS, "third_party_name")
