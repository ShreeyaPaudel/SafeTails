"""Coordination chat tied to a report: the reporter and any accepted helper(s) share a thread
so they can arrange the rescue after a help offer is accepted."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models._mixins import created_at_col, uuid_pk


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    report_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("reports.id"), index=True, nullable=False)
    sender_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = created_at_col()
