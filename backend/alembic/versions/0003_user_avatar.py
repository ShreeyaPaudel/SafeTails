"""add users.avatar_url column

Revision ID: 0003_user_avatar
Revises: 0002_report_note
Create Date: 2026-06-28
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003_user_avatar"
down_revision: Union[str, None] = "0002_report_note"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS avatar_url")
