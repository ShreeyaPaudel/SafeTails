"""performance indexes on hot query paths

The feed (WHERE moderation_state='published' ORDER BY created_at DESC), the analytics summary
(time windows over created_at), notifications (point events ORDER BY created_at DESC), the
reputation / "reports I confirmed" queries (confirmations by user_id), and chat (messages by
report ordered by time) all benefit from these. All statements are idempotent.

Revision ID: 0010_perf_indexes
Revises: 0009_user_preferences
Create Date: 2026-07-08
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0010_perf_indexes"
down_revision: Union[str, None] = "0009_user_preferences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEXES = [
    ("ix_reports_created_at", "reports", "(created_at)"),
    ("ix_reports_modstate_created", "reports", "(moderation_state, created_at DESC)"),
    ("ix_point_events_user_created", "point_events", "(user_id, created_at DESC)"),
    ("ix_confirmations_user", "report_confirmations", "(user_id)"),
    ("ix_messages_report_created", "messages", "(report_id, created_at)"),
    ("ix_help_requests_helper_status", "help_requests", "(helper_id, status)"),
    ("ix_likes_user", "likes", "(user_id)"),
    ("ix_comments_user", "comments", "(user_id)"),
]


def upgrade() -> None:
    for name, table, cols in _INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} {cols}")


def downgrade() -> None:
    for name, _table, _cols in _INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")
