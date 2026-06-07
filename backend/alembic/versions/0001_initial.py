"""initial schema: enable PostGIS + create all tables

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-12

We enable the PostGIS extension, then create every table from the ORM metadata
(`Base.metadata.create_all`). Using metadata here keeps the migration in lock-step with the
models and lets GeoAlchemy2 emit the geometry column + GIST spatial index correctly. See
docs/DECISIONS.md (2026-06-12) for the rationale.
"""
from typing import Sequence, Union

from alembic import op

from app.core.database import Base
import app.models  # noqa: F401  (registers all tables)

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
