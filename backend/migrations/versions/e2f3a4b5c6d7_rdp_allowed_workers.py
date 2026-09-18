"""Link RDP machines to the workers allowed to see and claim them.

Revision ID: e2f3a4b5c6d7
Revises: a9b0c1d2e3f4
Create Date: 2026-09-18

Visibility used to hang on a single ``rdp_resources.assigned_worker_id``, so a
machine could only ever be shown to one worker on the claim board. This join
table lets an admin mark one or many workers per machine; ``assigned_worker_id``
keeps its old meaning (who currently holds the seat).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "a9b0c1d2e3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rdp_resource_workers",
        sa.Column(
            "rdp_resource_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rdp_resources.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "worker_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workers.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    # The claim board asks "which machines may this worker see" on every load.
    op.create_index(
        "ix_rdp_resource_workers_worker",
        "rdp_resource_workers",
        ["worker_id"],
        unique=False,
    )
    # Every worker already allowed by the old single-assignment rule keeps
    # seeing their machine after this deploy.
    op.execute(
        """
        INSERT INTO rdp_resource_workers (rdp_resource_id, worker_id)
        SELECT id, assigned_worker_id
        FROM rdp_resources
        WHERE assigned_worker_id IS NOT NULL
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_rdp_resource_workers_worker", table_name="rdp_resource_workers")
    op.drop_table("rdp_resource_workers")
