"""Direct client-worker links."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = 'd4f8c2a91e65'
down_revision = 'c7d2e4f61a93'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('client_worker_links',
        sa.Column('client_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('worker_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workers.id', ondelete='CASCADE'), primary_key=True))

def downgrade():
    op.drop_table('client_worker_links')
