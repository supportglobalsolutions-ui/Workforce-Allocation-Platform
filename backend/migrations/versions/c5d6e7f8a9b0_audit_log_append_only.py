"""Block UPDATE/DELETE on audit_log so the trail cannot be rewritten.

Revision ID: c5d6e7f8a9b0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-25 15:10:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          RAISE EXCEPTION 'audit_log is append-only';
        END;
        $$;
        """
    )
    op.execute(
        """
        DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
        CREATE TRIGGER audit_log_immutable
        BEFORE UPDATE OR DELETE ON audit_log
        FOR EACH ROW
        EXECUTE PROCEDURE prevent_audit_log_mutation();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_mutation();")
