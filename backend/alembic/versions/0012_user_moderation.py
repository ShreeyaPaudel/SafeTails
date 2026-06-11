"""user moderation fields: spam_strikes + suspended_until

Revision ID: 0012_user_moderation
Revises: 0011_report_extra_images
Create Date: 2026-07-10
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0012_user_moderation"
down_revision: Union[str, None] = "0011_report_extra_images"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS spam_strikes INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS spam_strikes")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS suspended_until")
