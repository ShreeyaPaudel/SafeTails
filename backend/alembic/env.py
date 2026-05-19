"""Alembic environment. Pulls the DB URL from app settings (Supabase or local PostGIS)
and uses the ORM metadata as the migration target."""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, event, pool

from app.core.config import settings
from app.core.database import Base
import app.models  # noqa: F401  (registers all tables on Base.metadata)

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    # Set the PostGIS search_path at DBAPI connect time (before any transaction), so the
    # `geometry` type resolves during DDL without opening a stray transaction that would
    # otherwise roll back the migration on Supabase.
    @event.listens_for(connectable, "connect")
    def _set_search_path(dbapi_conn, _record):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute(f"SET search_path TO {settings.db_search_path}")
        cur.close()

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
