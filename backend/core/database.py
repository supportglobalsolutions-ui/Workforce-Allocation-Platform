from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from .config import settings

engine = create_engine(
    settings.DATABASE_URL,
    echo=not settings.is_production,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency — yields a SQLAlchemy session and guarantees close."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
