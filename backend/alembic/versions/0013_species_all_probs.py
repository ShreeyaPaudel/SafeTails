"""persist full per-class species probability distribution

Revision ID: 0013_species_all_probs
Revises: 0012_user_moderation
Create Date: 2026-07-10
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0013_species_all_probs"
down_revision: Union[str, None] = "0012_user_moderation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS species_all_probs JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS species_all_probs")
