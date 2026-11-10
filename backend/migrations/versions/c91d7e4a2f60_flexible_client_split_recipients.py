"""Store flexible client split recipients."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c91d7e4a2f60"
down_revision = "c3f81a6d9e42"  # after the client splits table
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("client_revenue_agreements", sa.Column("recipients", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))

def downgrade():
    op.drop_column("client_revenue_agreements", "recipients")
