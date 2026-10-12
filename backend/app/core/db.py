"""Sync SQLAlchemy 2.0 engine, session, Base. Shared with plugins via core import."""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def paginate(query, page: int = 1, page_size: int = 20, max_page_size: int = 100):
    """Offset pagination returning (rows, total). Clamps page/page_size."""
    page = max(page, 1)
    page_size = min(max(page_size, 1), max_page_size)
    total = query.order_by(None).count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return rows, total
