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
    # This project moved from a SQLAlchemy declarative Base to SQLModel;
    # models/base.py now re-exports SQLModel, so the metadata lives there.
    from sqlmodel import SQLModel
    import models  # noqa: F401 — registers every table on SQLModel.metadata

    SQLModel.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    from sqlmodel import SQLModel
    import models  # noqa: F401

    SQLModel.metadata.drop_all(bind=op.get_bind())
