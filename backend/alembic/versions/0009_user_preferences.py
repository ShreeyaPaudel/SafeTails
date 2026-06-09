"""user preferences (settings persistence)

Revision ID: 0009_user_preferences
Revises: 0008_messages
Create Date: 2026-07-08
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0009_user_preferences"
down_revision: Union[str, None] = "0008_messages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS preferences")
