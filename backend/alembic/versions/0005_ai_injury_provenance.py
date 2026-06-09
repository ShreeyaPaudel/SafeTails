"""immutable AI injury provenance on reports

Preserve the original AI injury assessment permanently so a later human review never
overwrites it (HITL provenance). All statements are idempotent.

Revision ID: 0005_ai_injury_provenance
Revises: 0004_help_requests
Create Date: 2026-06-29
"""
from typing import Sequence, Union

from alembic import op

from app.core.database import Base
import app.models  # noqa: F401  (registers all tables)

revision: str = "0005_ai_injury_provenance"
down_revision: Union[str, None] = "0004_help_requests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_injury_status VARCHAR")
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_injury_confidence DOUBLE PRECISION")
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_injury_rationale TEXT")
    op.execute(
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS injury_user_override BOOLEAN NOT NULL DEFAULT FALSE"
    )
    # Backfill provenance for existing rows: the current stored injury WAS the AI output
    # (no human overrides existed before this migration).
    op.execute(
        "UPDATE reports SET ai_injury_status = injury_status, "
        "ai_injury_confidence = injury_confidence, ai_injury_rationale = injury_rationale "
        "WHERE ai_injury_status IS NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS injury_user_override")
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS ai_injury_rationale")
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS ai_injury_confidence")
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS ai_injury_status")
