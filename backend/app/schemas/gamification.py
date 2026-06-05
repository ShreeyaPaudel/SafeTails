from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserPublic


class LeaderboardEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    display_name: str
    avatar_url: str | None = None
    points: int
    reputation: float
    level: int
    reports_count: int = 0
    ward: str | None = None


class BadgeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    description: str
    awarded_at: datetime | None = None


class ProfileStats(BaseModel):
    total_reports: int
    published_reports: int
    distinct_wards: int
    resolved_reports: int
    helped_count: int = 0        # rescue cases this user assisted on
    reporting_streak: int = 0    # consecutive-day reporting streak
    spam_strikes: int = 0        # confirmed-spam strikes (trust-and-safety)
    suspended: bool = False      # currently under a posting cooldown


class ProfileOut(BaseModel):
    user: UserPublic
    badges: list[BadgeOut]
    all_badges: list[dict] = []
    reputation_breakdown: dict = {}
    rank: int | None = None
    stats: ProfileStats


class ConfirmationResult(BaseModel):
    moderation_state: str
    confirm_count: int
    flag_count: int
    flag_weight: float = 0.0
    transition: str | None
