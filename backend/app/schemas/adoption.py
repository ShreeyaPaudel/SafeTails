from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AdoptionCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    contact_info: str = Field(default="", max_length=200)
    photo_path: str | None = None
    report_id: uuid.UUID | None = None  # optionally link the sighting this animal came from


class AdoptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str
    photo_path: str | None = None
    contact_info: str
    status: str
    report_id: uuid.UUID | None = None
    created_by: uuid.UUID
    created_by_name: str | None = None
    created_at: datetime
