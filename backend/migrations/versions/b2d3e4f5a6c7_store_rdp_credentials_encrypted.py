"""Store RDP credentials (password encrypted) on the machine row

Revision ID: b2d3e4f5a6c7
Revises: a1c2e3f4d5b6
Create Date: 2026-09-14

Guacamole holds these values in plaintext in its own database, which lives in a
Docker volume on whichever host is running. That made the platform dependent on
one Guacamole instance: deploy to a new VPS and every machine needed its
password retyped by hand.

Keeping them here — with the password Fernet-encrypted — lets the connection be
rebuilt automatically on any host, and is stricter at rest than Guacamole's own
storage.
"""
from alembic import op

revision = "b2d3e4f5a6c7"
down_revision = "a1c2e3f4d5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE rdp_resources ADD COLUMN IF NOT EXISTS rdp_username VARCHAR(128)")
    op.execute("ALTER TABLE rdp_resources ADD COLUMN IF NOT EXISTS rdp_password_enc TEXT")
    op.execute("ALTER TABLE rdp_resources ADD COLUMN IF NOT EXISTS rdp_domain VARCHAR(128)")


def downgrade() -> None:
    op.execute("ALTER TABLE rdp_resources DROP COLUMN IF EXISTS rdp_domain")
    op.execute("ALTER TABLE rdp_resources DROP COLUMN IF EXISTS rdp_password_enc")
    op.execute("ALTER TABLE rdp_resources DROP COLUMN IF EXISTS rdp_username")
