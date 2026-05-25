"""SQLAlchemy engine, session factory, and declarative base.

PostGIS geometry support comes from GeoAlchemy2, which registers with SQLAlchemy on import.
"""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


def _build_engine():
    url = settings.database_url
    is_pg = url.startswith("postgres")
    kwargs: dict = {"pool_pre_ping": True, "future": True}
    if is_pg:
        # Robustness over a high-latency / flaky cloud link (e.g. Supabase direct host):
        #  - bound the connect time so a stalled socket fails fast instead of hanging ~21s;
        #  - TCP keepalives so idle pooled connections don't silently die between requests;
        #  - recycle connections well before the server/NAT drops them;
        #  - a server-side statement timeout so a stuck query can't hang a request forever.
        kwargs.update(
            pool_recycle=280,
            pool_size=5,
            max_overflow=10,
            connect_args={
                "connect_timeout": 10,
                "keepalives": 1,
                "keepalives_idle": 30,
                "keepalives_interval": 10,
                "keepalives_count": 5,
                "options": "-c statement_timeout=20000",
            },
        )
    eng = create_engine(url, **kwargs)
    if eng.dialect.name == "postgresql":
        # Ensure the PostGIS schema is on the search_path so the `geometry` type resolves.
        @event.listens_for(eng, "connect")
        def _set_search_path(dbapi_conn, _record):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute(f"SET search_path TO {settings.db_search_path}")
            cur.close()

    return eng


engine = _build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def get_db() -> Generator:
    """FastAPI dependency that yields a scoped DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
