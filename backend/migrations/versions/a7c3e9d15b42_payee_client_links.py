"""Payee client links: each recipient's standing % of a client.

Seeded from every client's most recent month of split recipients.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a7c3e9d15b42"
down_revision = "d4f8c2a91e65"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "payee_client_links",
        sa.Column("payee_id", UUID(as_uuid=True), sa.ForeignKey("payees.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("pct", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("pct >= 0 AND pct <= 100", name="ck_payee_client_links_pct"),
    )
    op.execute(
        """
        INSERT INTO payee_client_links (payee_id, client_id, pct)
        SELECT DISTINCT ON (r.payee_id, r.client_id) r.payee_id, r.client_id, r.pct
        FROM client_split_recipients r
        JOIN payroll_periods p ON p.id = r.payroll_period_id
        WHERE r.payee_id IS NOT NULL
          AND p.start_date = (
              SELECT max(p2.start_date)
              FROM client_split_recipients r2
              JOIN payroll_periods p2 ON p2.id = r2.payroll_period_id
              WHERE r2.client_id = r.client_id
          )
        ORDER BY r.payee_id, r.client_id
        """
    )


def downgrade():
    op.drop_table("payee_client_links")
