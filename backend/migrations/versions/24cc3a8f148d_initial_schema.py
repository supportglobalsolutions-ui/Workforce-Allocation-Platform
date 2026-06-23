"""initial_schema

Revision ID: 24cc3a8f148d
Revises:
Create Date: 2026-06-23 21:08:53.190922

"""
from typing import Sequence, Union

from alembic import op

revision: str = "24cc3a8f148d"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from models.base import Base
    import models  # noqa: F401 — register all ORM tables on Base.metadata

    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    from models.base import Base
    import models  # noqa: F401

    Base.metadata.drop_all(bind=op.get_bind())
