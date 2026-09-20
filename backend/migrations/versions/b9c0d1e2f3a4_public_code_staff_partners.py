"""Staff get no public_code; partners use P prefix.

Revision ID: b9c0d1e2f3a4
Revises: a6b7c8d9e0f1
Create Date: 2026-09-19
"""

from typing import Sequence, Union

from alembic import op

revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, None] = "a6b7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Allow NULL — leadership / ops accounts have no worker/partner ID.
    op.alter_column("workers", "public_code", nullable=True)

    # Clear codes for staff org roles (not workers/partners).
    op.execute(
        """
        UPDATE workers AS w
        SET public_code = NULL
        FROM admin_users AS au
        WHERE w.admin_user_id = au.id
          AND au.role IN ('ceo_leadership', 'operations_lead', 'country_manager')
        """
    )

    # Partners use P… instead of G… (keep date + sequence).
    op.execute(
        """
        UPDATE workers
        SET public_code = 'P' || substring(public_code FROM 2)
        WHERE worker_type = 'partner_worker'
          AND public_code IS NOT NULL
          AND public_code LIKE 'G%'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE workers
        SET public_code = 'G' || substring(public_code FROM 2)
        WHERE worker_type = 'partner_worker'
          AND public_code IS NOT NULL
          AND public_code LIKE 'P%'
        """
    )
    # Placeholder only — staff codes cannot be reconstructed.
    op.execute(
        """
        UPDATE workers
        SET public_code = 'G010101001'
        WHERE public_code IS NULL
        """
    )
    op.alter_column("workers", "public_code", nullable=False)
