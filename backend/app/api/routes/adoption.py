"""Adoption listings (lightweight): simple listings for rescued/adoptable animals - photo,
description and a contact line. Listings only; no payments, no in-app messaging (per proposal)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.adoption import Adoption
from app.models.user import User
from app.schemas.adoption import AdoptionCreate, AdoptionOut

router = APIRouter()


def _to_out(a: Adoption, name: str | None) -> AdoptionOut:
    out = AdoptionOut.model_validate(a)
    out.created_by_name = name
    return out


@router.get("", response_model=list[AdoptionOut])
def list_adoptions(
    status: str | None = Query(None, pattern="^(available|adopted)$"),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db),
):
    stmt = select(Adoption, User).join(User, User.id == Adoption.created_by).order_by(Adoption.created_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(Adoption.status == status)
    rows = db.execute(stmt).all()
    return [_to_out(a, (u.display_name or u.username) if u else None) for a, u in rows]


@router.post("", response_model=AdoptionOut, status_code=201)
def create_adoption(
    payload: AdoptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    a = Adoption(
        created_by=user.id,
        title=payload.title.strip(),
        description=(payload.description or "").strip(),
        contact_info=(payload.contact_info or "").strip(),
        photo_path=payload.photo_path,
        report_id=payload.report_id,
        status="available",
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _to_out(a, user.display_name or user.username)


@router.patch("/{adoption_id}", response_model=AdoptionOut)
def update_adoption(
    adoption_id: uuid.UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Owner (or moderator) marks a listing available/adopted."""
    a = db.get(Adoption, adoption_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if a.created_by != user.id and user.role not in ("moderator", "admin"):
        raise HTTPException(status_code=403, detail="Not allowed to edit this listing")
    new_status = payload.get("status")
    if new_status in ("available", "adopted"):
        a.status = new_status
    db.commit()
    db.refresh(a)
    return _to_out(a, user.display_name or user.username)


@router.delete("/{adoption_id}", status_code=204)
def delete_adoption(
    adoption_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    a = db.get(Adoption, adoption_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if a.created_by != user.id and user.role not in ("moderator", "admin"):
        raise HTTPException(status_code=403, detail="Not allowed to delete this listing")
    db.delete(a)
    db.commit()
    return None
