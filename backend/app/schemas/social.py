from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.report import ReportPublic


class CommentAuthor(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    display_name: str
    avatar_url: str | None = None


class CommentOut(BaseModel):
    id: uuid.UUID
    report_id: uuid.UUID
    author: CommentAuthor
    body: str
    created_at: datetime


class CommentCreate(BaseModel):
    body: str


class LikeResult(BaseModel):
    like_count: int
    liked: bool


class FeedItem(BaseModel):
    report: ReportPublic
    like_count: int
    comment_count: int
    liked_by_me: bool
    confirm_count: int = 0
    flag_count: int = 0
    confirmed_by_me: bool = False


class Confirmer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str
    username: str
    avatar_url: str | None = None
    vote: str
    created_at: datetime


class ConfirmationInfo(BaseModel):
    confirm_count: int
    flag_count: int
    confirmed_by_me: bool
    my_vote: str | None = None
    confirmers: list[Confirmer]
