"""Public contact-form enquiries

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-15

Messages from the public contact form. Kept separate from notifications
because the sender has no platform account — typically they are writing
precisely because they cannot sign in.
"""
from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS contact_messages (
            id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name                    VARCHAR(120)  NOT NULL,
            email                   VARCHAR(254)  NOT NULL,
            subject                 VARCHAR(160)  NOT NULL,
            message                 TEXT          NOT NULL,
            status                  VARCHAR(16)   NOT NULL DEFAULT 'new',
            handled_by_auth_user_id VARCHAR(128),
            handled_at              TIMESTAMPTZ,
            ip_address              VARCHAR(45),
            user_agent              VARCHAR(255),
            created_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
        )
        """
    )
    # Inbox reads newest-first and filters unread; email supports "has this
    # person written before?" while triaging.
    op.execute("CREATE INDEX IF NOT EXISTS ix_contact_messages_created ON contact_messages (created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_contact_messages_status  ON contact_messages (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_contact_messages_email   ON contact_messages (email)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_contact_messages_email")
    op.execute("DROP INDEX IF EXISTS ix_contact_messages_status")
    op.execute("DROP INDEX IF EXISTS ix_contact_messages_created")
    op.execute("DROP TABLE IF EXISTS contact_messages")
