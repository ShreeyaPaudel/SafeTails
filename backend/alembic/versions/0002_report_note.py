"""add reports.note column

Revision ID: 0002_report_note
Revises: 0001_initial
Create Date: 2026-06-27

Additive column for the reporter's free-text note (shown across the UI). The submit endpoint
already accepted `note`; this persists it.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_report_note"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent: migration 0001 uses Base.metadata.create_all against the *current* models, so on
    # a fresh DB the column already exists. IF NOT EXISTS makes this safe on both fresh and old DBs.
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS note TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS note")
