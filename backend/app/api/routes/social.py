"""Social feed, likes, comments (SDT relatedness)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional
from app.core.database import get_db
from app.models.user import User
from app.schemas.report import ReportPublic
from app.schemas.social import CommentCreate, CommentOut, ConfirmationInfo, FeedItem, LikeResult
from app.services import social_service

router = APIRouter()


@router.get("/feed", response_model=list[FeedItem])
def feed(
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
):
    return social_service.get_feed(db, viewer, limit, offset)


@router.get("/me/confirmed-reports", response_model=list[ReportPublic])
def my_confirmed_reports(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Reports the current user has confirmed (their peer-review contribution history)."""
    return social_service.reports_confirmed_by(db, user)


@router.get("/reports/{report_id}/confirmations", response_model=ConfirmationInfo)
def report_confirmations(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
):
    """Who confirmed/flagged a report, plus counts and the viewer's own vote."""
    return social_service.confirmation_info(db, report_id, viewer)


@router.post("/reports/{report_id}/like", response_model=LikeResult)
def like(report_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return social_service.like(db, report_id, user)


@router.delete("/reports/{report_id}/like", response_model=LikeResult)
def unlike(report_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return social_service.unlike(db, report_id, user)


@router.get("/reports/{report_id}/comments", response_model=list[CommentOut])
def list_comments(report_id: uuid.UUID, db: Session = Depends(get_db)):
    return social_service.list_comments(db, report_id)


@router.post("/reports/{report_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(
    report_id: uuid.UUID,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return social_service.add_comment(db, report_id, user, payload.body)
