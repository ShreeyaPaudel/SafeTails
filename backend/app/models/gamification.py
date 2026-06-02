from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models._mixins import created_at_col, uuid_pk


class Badge(Base):
    __tablename__ = "badges"

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    criteria: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class UserBadge(Base):
    __tablename__ = "user_badges"
    __table_args__ = (UniqueConstraint("user_id", "badge_id", name="uq_user_badge"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), index=True, nullable=False
    )
    badge_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("badges.id"), nullable=False
    )
    awarded_at: Mapped[datetime] = created_at_col()
