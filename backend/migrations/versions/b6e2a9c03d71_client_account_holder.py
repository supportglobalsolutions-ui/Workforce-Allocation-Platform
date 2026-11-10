"""Add a client account holder independent of revenue ownership."""
from alembic import op
import sqlalchemy as sa

revision = 'b6e2a9c03d71'
down_revision = 'a4d8e1f05b27'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('clients', sa.Column('account_holder', sa.String(255), nullable=True))

def downgrade():
    op.drop_column('clients', 'account_holder')
