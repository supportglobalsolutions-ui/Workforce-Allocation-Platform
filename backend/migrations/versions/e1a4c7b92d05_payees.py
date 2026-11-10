"""Payees: who client split recipients are paid to; recipient amount overrides.

Seeds a Global Solutions payee, one payee per distinct recipient name, and, for
clients with a revenue agreement but no recipients, current-month recipients
built from that agreement (owner, third party, GS).
"""
from datetime import date

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "e1a4c7b92d05"
down_revision = "d0b6a3f18c42"
branch_labels = None
depends_on = None

GS_NAME = "Global Solutions"
GS_ALIASES = {"gs", "global solutions", "globalsolutions", "global solution"}


def upgrade():
    op.create_table(
        "payees",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("is_gs", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("payout_currency", sa.String(3), nullable=True),
        sa.Column("payout_email", sa.String(255), nullable=True),
        sa.Column("payout_method", sa.String(64), nullable=True),
        sa.Column("payout_details", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.add_column(
        "client_split_recipients",
        sa.Column("payee_id", UUID(as_uuid=True), sa.ForeignKey("payees.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_client_split_recipients_payee_id", "client_split_recipients", ["payee_id"])
    op.add_column("client_split_recipients", sa.Column("amount_override", sa.Numeric(14, 2), nullable=True))

    conn = op.get_bind()
    gs_id = conn.execute(
        sa.text("INSERT INTO payees (name, is_gs) VALUES (:n, true) RETURNING id"), {"n": GS_NAME},
    ).scalar()
    payees: dict[str, object] = {GS_NAME.casefold(): gs_id}

    def payee_for(name: str, currency=None, email=None, method=None, details=None):
        key = name.strip().casefold()
        if key in GS_ALIASES:
            return gs_id
        if key not in payees:
            payees[key] = conn.execute(
                sa.text(
                    "INSERT INTO payees (name, payout_currency, payout_email, payout_method, payout_details) "
                    "VALUES (:n, :c, :e, :m, :d) RETURNING id"
                ),
                {"n": name.strip()[:120], "c": currency, "e": email, "m": method, "d": details},
            ).scalar()
        return payees[key]

    for (name,) in conn.execute(sa.text(
        "SELECT DISTINCT name FROM client_split_recipients WHERE name IS NOT NULL AND trim(name) <> ''"
    )).all():
        conn.execute(
            sa.text("UPDATE client_split_recipients SET payee_id = :p WHERE name = :n"),
            {"p": payee_for(name), "n": name},
        )

    today = date.today()
    period = conn.execute(sa.text(
        "SELECT id FROM payroll_periods WHERE start_date <= :d AND end_date >= :d ORDER BY start_date DESC LIMIT 1"
    ), {"d": today}).scalar() or conn.execute(sa.text(
        "SELECT id FROM payroll_periods ORDER BY start_date DESC LIMIT 1"
    )).scalar()
    if period is None:
        return

    rows = conn.execute(sa.text(
        """
        SELECT DISTINCT ON (a.client_id)
               a.client_id, a.gs_pct, a.owner_pct, a.third_party_pct, a.third_party_name, a.effective_to,
               c.name, c.account_holder, c.payout_currency, c.payout_email, c.payout_method, c.payout_details
          FROM client_revenue_agreements a
          JOIN clients c ON c.id = a.client_id
         WHERE a.effective_from <= :d
           AND NOT EXISTS (SELECT 1 FROM client_split_recipients r WHERE r.client_id = a.client_id)
         ORDER BY a.client_id, a.effective_from DESC
        """
    ), {"d": today}).all()
    for r in rows:
        if r.effective_to is not None and r.effective_to < today:
            continue
        lines = []
        if r.owner_pct and r.owner_pct > 0:
            owner = (r.account_holder or r.name).strip()
            lines.append((payee_for(owner, r.payout_currency, r.payout_email, r.payout_method, r.payout_details),
                          owner, r.owner_pct))
        if r.third_party_pct and r.third_party_pct > 0 and r.third_party_name:
            lines.append((payee_for(r.third_party_name), r.third_party_name.strip(), r.third_party_pct))
        if r.gs_pct and r.gs_pct > 0:
            lines.append((gs_id, GS_NAME, r.gs_pct))
        for slot, (payee_id, name, pct) in enumerate(lines, start=1):
            conn.execute(sa.text(
                "INSERT INTO client_split_recipients (client_id, payroll_period_id, slot, payee_id, name, pct) "
                "VALUES (:c, :p, :s, :payee, :n, :pct)"
            ), {"c": r.client_id, "p": period, "s": slot, "payee": payee_id, "n": name[:120], "pct": pct})


def downgrade():
    op.drop_column("client_split_recipients", "amount_override")
    op.drop_index("ix_client_split_recipients_payee_id", table_name="client_split_recipients")
    op.drop_column("client_split_recipients", "payee_id")
    op.drop_table("payees")
