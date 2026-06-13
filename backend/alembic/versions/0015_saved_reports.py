"""saved_reports (bookmarks) table

Revision ID: 0015_saved_reports
Revises: 0014_resp_ai_feedback
Create Date: 2026-07-10
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0015_saved_reports"
down_revision: Union[str, None] = "0014_resp_ai_feedback"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS saved_reports (
            id UUID PRIMARY KEY,
            report_id UUID NOT NULL REFERENCES reports(id),
            user_id UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_saved_once UNIQUE (report_id, user_id)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_saved_reports_user_id ON saved_reports(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_saved_reports_report_id ON saved_reports(report_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS saved_reports")
