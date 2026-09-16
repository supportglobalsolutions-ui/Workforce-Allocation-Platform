"""Chat between signed-in accounts and the admin team

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-15

One thread per account, many messages. Separate from contact_messages, which
is for people who have no account and cannot sign in.
"""
from alembic import op

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_threads (
            id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            auth_user_id          VARCHAR(128) NOT NULL UNIQUE,
            admin_user_id         UUID REFERENCES admin_users(id),
            display_name          VARCHAR(255) NOT NULL,
            email                 VARCHAR(254) NOT NULL,
            role                  VARCHAR(32)  NOT NULL DEFAULT 'user',
            subject               VARCHAR(160),
            last_message_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
            last_message_preview  VARCHAR(200),
            unread_for_admin      INTEGER      NOT NULL DEFAULT 0,
            unread_for_user       INTEGER      NOT NULL DEFAULT 0,
            is_archived           BOOLEAN      NOT NULL DEFAULT false,
            created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            thread_id            UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
            sender_side          VARCHAR(8)   NOT NULL,
            sender_auth_user_id  VARCHAR(128) NOT NULL,
            sender_name          VARCHAR(255) NOT NULL,
            body                 TEXT         NOT NULL,
            read_at              TIMESTAMPTZ,
            created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
        """
    )
    # Thread list is ordered by recency; a conversation reads oldest-first.
    op.execute("CREATE INDEX IF NOT EXISTS ix_chat_threads_recent  ON chat_threads (last_message_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chat_threads_unread  ON chat_threads (unread_for_admin)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chat_messages_thread ON chat_messages (thread_id, created_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_chat_messages_thread")
    op.execute("DROP INDEX IF EXISTS ix_chat_threads_unread")
    op.execute("DROP INDEX IF EXISTS ix_chat_threads_recent")
    op.execute("DROP TABLE IF EXISTS chat_messages")
    op.execute("DROP TABLE IF EXISTS chat_threads")
