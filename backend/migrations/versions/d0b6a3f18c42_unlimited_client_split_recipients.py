"""Allow any number of recipients in client split schedules."""
from alembic import op

revision = "d0b6a3f18c42"
down_revision = "c91d7e4a2f60"
branch_labels = None
depends_on = None

def upgrade():
    op.drop_constraint("ck_client_split_recipients_slot", "client_split_recipients", type_="check")

def downgrade():
    op.create_check_constraint("ck_client_split_recipients_slot", "client_split_recipients", "slot BETWEEN 1 AND 3")
