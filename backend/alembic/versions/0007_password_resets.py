"""password reset tokens (link + otp)

Revision ID: 0007_password_resets
Revises: 0006_user_location_and_oauth
Create Date: 2026-07-08
"""
from typing import Sequence, Union

from alembic import op

from app.core.database import Base
import app.models  # noqa: F401

revision: str = "0007_password_resets"
down_revision: Union[str, None] = "0006_user_location_and_oauth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # create_all makes the new password_resets table (leaves existing tables untouched).
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS password_resets")
