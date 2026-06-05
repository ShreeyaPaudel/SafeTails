from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GeneralisedLocation(BaseModel):
    """Privacy-preserving location: generalised point + ward only."""

    lat: float
    lng: float
    ward: str | None = None


class AIEstimate(BaseModel):
    """Wrapper marking a value as AI-generated for UI labelling."""

    value: object
    confidence: float | None = None
    source: str  # "cnn" | "gemini"
    is_ai_estimate: bool = True
    rationale: str | None = None


class ReportPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reporter_id: uuid.UUID
    reporter_name: str | None = None
    reporter_reputation: float | None = None
    reporter_avatar_url: str | None = None
    image_path: str
    extra_images: list[str] = []
    location: GeneralisedLocation
    species_label: str
    species_confidence: float | None
    species_source: str
    species_all_probs: dict | None = None  # full model distribution captured at inference
    species_user_override: str | None
    injury_status: str
    injury_confidence: float | None
    injury_rationale: str | None
    # Original AI injury assessment (immutable provenance) shown alongside any human review.
    ai_injury_status: str | None = None
    ai_injury_confidence: float | None = None
    ai_injury_rationale: str | None = None
    injury_user_override: bool = False
    note: str | None = None
    status: str
    moderation_state: str
    spam_score: float
    # Owner/moderator-only transparency: {reasons, decision, components{signal: score}}.
    # Omitted from the public feed so the anti-spam internals can't be probed to game them.
    moderation: dict | None = None
    created_at: datetime
    ai_notice: str | None = None  # response-only: surfaced AI warning (e.g. quota/timeout)


class ReportCreate(BaseModel):
    """Multipart form fields accompany the uploaded image at the endpoint."""

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    species_user_label: str | None = None
    note: str | None = None


class ReportUpdate(BaseModel):
    status: str | None = None
    species_user_override: str | None = None


class ConfirmationCreate(BaseModel):
    vote: str  # confirm | flag_spam | flag_invalid
