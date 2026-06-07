"""help requests + reports.helper_id

Revision ID: 0004_help_requests
Revises: 0003_user_avatar
Create Date: 2026-06-28
"""
from typing import Sequence, Union

from alembic import op

from app.core.database import Base
import app.models  # noqa: F401  (registers all tables)

revision: str = "0004_help_requests"
down_revision: Union[str, None] = "0003_user_avatar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # create_all only creates missing tables (e.g. help_requests); it won't alter reports,
    # so add helper_id explicitly (idempotent).
    Base.metadata.create_all(bind=op.get_bind())
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS helper_id UUID REFERENCES users(id)")


def downgrade() -> None:
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS helper_id")
    op.execute("DROP TABLE IF EXISTS help_requests")
