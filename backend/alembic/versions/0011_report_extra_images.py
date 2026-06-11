"""multiple images per report (extra_images)

Revision ID: 0011_report_extra_images
Revises: 0010_perf_indexes
Create Date: 2026-07-10
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0011_report_extra_images"
down_revision: Union[str, None] = "0010_perf_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS extra_images JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS extra_images")
