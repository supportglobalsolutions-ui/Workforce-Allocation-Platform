from sqlalchemy import DateTime

# Portable alias for PostgreSQL TIMESTAMPTZ across SQLAlchemy versions.
TIMESTAMPTZ = DateTime(timezone=True)
