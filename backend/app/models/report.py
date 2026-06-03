from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models._mixins import created_at_col, uuid_pk

# Controlled vocabularies (kept as plain strings for portability; validated in schemas)
SPECIES_LABELS = ("Dog", "Cat", "Cow", "Buffalo", "Other", "Unverified")
INJURY_STATES = ("injured", "not_injured", "unknown")
REPORT_STATUSES = ("active", "being_helped", "resolved")
MODERATION_STATES = ("published", "pending_confirmation", "rejected")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = uuid_pk()
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), index=True, nullable=False
    )

    image_path: Mapped[str] = mapped_column(String, nullable=False)  # main image (AI-analysed)
    # Additional photos attached to the report (URLs). The main image_path above is analysed by the
    # AI; these are extra views shown in the feed gallery/carousel. JSONB on PG, JSON on SQLite.
    extra_images: Mapped[list | None] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    image_phash: Mapped[str | None] = mapped_column(String, index=True, nullable=True)

    # Generalised location only (privacy) - SRID 4326. Raw GPS is never stored.
    geom: Mapped[object] = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    ward: Mapped[str | None] = mapped_column(String, index=True, nullable=True)

    # Species (own CNN; Gemini second opinion on low confidence)
    species_label: Mapped[str] = mapped_column(String, index=True, default="Unverified")
    species_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    species_source: Mapped[str] = mapped_column(String, default="cnn")  # cnn | gemini
    species_user_override: Mapped[str | None] = mapped_column(String, nullable=True)
    # The FULL per-class probability distribution from the model at inference time, stored once so
    # the report detail always shows the SAME breakdown the pre-submit AI card showed (never
    # re-synthesised). Keys are the class names (Dog/Cat/Cow/Buffalo/Other). JSONB on PG.
    species_all_probs: Mapped[dict | None] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=True)

    # Injury - EFFECTIVE values (what the app acts on; may reflect a human override).
    injury_status: Mapped[str] = mapped_column(String, default="unknown")
    injury_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    injury_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Injury - ORIGINAL AI output, captured once at creation and NEVER overwritten. This is the
    # permanent record of what the model said, shown alongside any human review (HITL provenance).
    ai_injury_status: Mapped[str | None] = mapped_column(String, nullable=True)
    ai_injury_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_injury_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    # True when a human (reporter/reviewer) set the injury status, diverging from the AI.
    injury_user_override: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Free-text note from the reporter (shown across the UI).
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Anti-spam
    spam_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # Structured moderation record: {reasons: [...], decision: [...], components: {signal: score}}.
    spam_reasons: Mapped[dict | None] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=True)

    status: Mapped[str] = mapped_column(String, default="active", index=True)
    moderation_state: Mapped[str] = mapped_column(String, default="published", index=True)
    helper_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True)
    # Response-time analytics: when a responder was first accepted, and when the case was resolved.
    first_helped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = created_at_col()

    reporter: Mapped["User"] = relationship(back_populates="reports", foreign_keys=[reporter_id])  # noqa: F821
    confirmations: Mapped[list["ReportConfirmation"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )


class ReportConfirmation(Base):
    __tablename__ = "report_confirmations"
    __table_args__ = (UniqueConstraint("report_id", "user_id", name="uq_confirm_once"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    report_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("reports.id"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False
    )
    vote: Mapped[str] = mapped_column(String, nullable=False)  # confirm | flag_spam | flag_invalid
    created_at: Mapped[datetime] = created_at_col()

    report: Mapped["Report"] = relationship(back_populates="confirmations")


class HelpRequest(Base):
    """A volunteer offers to help on a report; the reporter accepts or declines."""

    __tablename__ = "help_requests"
    __table_args__ = (UniqueConstraint("report_id", "helper_id", name="uq_help_once"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    report_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("reports.id"), index=True, nullable=False)
    helper_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String, default="pending", index=True)  # pending|accepted|declined
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = created_at_col()


class AIFeedback(Base):
    """User feedback on an AI result ('was this right?') - responsible-AI transparency + a live
    signal of model quality. One vote per user per report per target."""

    __tablename__ = "ai_feedback"
    __table_args__ = (UniqueConstraint("report_id", "user_id", "target", name="uq_ai_feedback_once"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    report_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("reports.id"), index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    target: Mapped[str] = mapped_column(String, nullable=False)  # species | injury
    agree: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = created_at_col()


class PointEvent(Base):
    """Audit trail for every points / reputation change (thesis-critical correctness area)."""

    __tablename__ = "point_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), index=True, nullable=False
    )
    report_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("reports.id"), nullable=True
    )
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = created_at_col()
