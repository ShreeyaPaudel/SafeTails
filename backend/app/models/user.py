from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

# JSONB on Postgres, plain JSON on SQLite (used by the test suite).
_JSON = JSONB().with_variant(JSON(), "sqlite")

from app.core.database import Base
from app.models._mixins import created_at_col, uuid_pk


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    # Nullable: users who sign in with Google have no local password.
    hashed_password: Mapped[str | None] = mapped_column(String, nullable=True)
    display_name: Mapped[str] = mapped_column(String, nullable=False, default="")
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    # Google account subject id for OAuth sign-in / account linking (unique when present).
    google_sub: Mapped[str | None] = mapped_column(String, unique=True, index=True, nullable=True)

    # Saved preferred/default location (used by "Near me", rescue recommendations, etc.).
    default_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    default_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    default_ward: Mapped[str | None] = mapped_column(String, nullable=True)

    # Gamification (see docs/GAMIFICATION.md)
    reputation: Mapped[float] = mapped_column(Float, default=50.0, nullable=False)
    points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Moderation / trust-and-safety. `spam_strikes` counts reports that were CONFIRMED as spam
    # (community-flagged past threshold or rejected); it drives escalating consequences.
    # `suspended_until` is a posting cooldown/suspension window enforced at submit time.
    spam_strikes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    suspended_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # User preferences (notifications, language, public profile, etc.). Persisted + returned on
    # /auth/me so settings survive across sessions and sync everywhere.
    preferences: Mapped[dict | None] = mapped_column(_JSON, nullable=True)

    role: Mapped[str] = mapped_column(String, default="user", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = created_at_col()

    reports: Mapped[list["Report"]] = relationship(
        back_populates="reporter", foreign_keys="Report.reporter_id"
    )  # noqa: F821
