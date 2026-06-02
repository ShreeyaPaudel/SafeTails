from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models._mixins import created_at_col, uuid_pk


class Adoption(Base):
    """Lightweight adoption listing (stretch feature)."""

    __tablename__ = "adoptions"

    id: Mapped[uuid.UUID] = uuid_pk()
    report_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("reports.id"), nullable=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    photo_path: Mapped[str | None] = mapped_column(String, nullable=True)
    contact_info: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="available")  # available | adopted
    created_at: Mapped[datetime] = created_at_col()
