"""user saved location + google oauth linking

Adds saved default location (for "Near me"/recommendations), a Google subject id for OAuth
sign-in + account linking, and makes hashed_password nullable (OAuth users have no password).
All statements are idempotent.

Revision ID: 0006_user_location_and_oauth
Revises: 0005_ai_injury_provenance
Create Date: 2026-06-29
"""
from typing import Sequence, Union

from alembic import op

from app.core.database import Base
import app.models  # noqa: F401

revision: str = "0006_user_location_and_oauth"
down_revision: Union[str, None] = "0005_ai_injury_provenance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS default_lat DOUBLE PRECISION")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS default_lng DOUBLE PRECISION")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS default_ward VARCHAR")
    op.execute("ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_google_sub")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS default_ward")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS default_lng")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS default_lat")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS google_sub")
