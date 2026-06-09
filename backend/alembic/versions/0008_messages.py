"""helper-reporter coordination chat

Revision ID: 0008_messages
Revises: 0007_password_resets
Create Date: 2026-07-08
"""
from typing import Sequence, Union

from alembic import op

from app.core.database import Base
import app.models  # noqa: F401

revision: str = "0008_messages"
down_revision: Union[str, None] = "0007_password_resets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS messages")
