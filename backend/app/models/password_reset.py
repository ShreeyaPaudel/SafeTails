"""Password-reset records backing both the link-based and OTP-based flows.

Each request stores a single-use, short-lived credential pair: a URL-safe `token` (for the
emailed reset link) and a 6-digit `otp` (for code entry). Either can complete the reset; both
expire together and are invalidated once used.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models._mixins import created_at_col, uuid_pk


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True, nullable=False)
    token: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)  # link
    otp: Mapped[str] = mapped_column(String, nullable=False)                              # code entry
    method: Mapped[str] = mapped_column(String, default="link")                           # link | otp (requested)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = created_at_col()
