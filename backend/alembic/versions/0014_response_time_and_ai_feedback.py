"""response-time columns + ai_feedback table

Revision ID: 0014_response_time_and_ai_feedback
Revises: 0013_species_all_probs
Create Date: 2026-07-10
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0014_resp_ai_feedback"
down_revision: Union[str, None] = "0013_species_all_probs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS first_helped_at TIMESTAMPTZ")
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_feedback (
            id UUID PRIMARY KEY,
            report_id UUID NOT NULL REFERENCES reports(id),
            user_id UUID NOT NULL REFERENCES users(id),
            target VARCHAR NOT NULL,
            agree BOOLEAN NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_ai_feedback_once UNIQUE (report_id, user_id, target)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_ai_feedback_report_id ON ai_feedback(report_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ai_feedback")
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS resolved_at")
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS first_helped_at")
