from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    display_name: str
    avatar_url: str | None = None
    reputation: float
    points: int
    level: int
    role: str
    created_at: datetime
    default_lat: float | None = None
    default_lng: float | None = None
    default_ward: str | None = None
    preferences: dict | None = None


class UserRegister(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    user: UserPublic
    access_token: str
    token_type: str = "bearer"
