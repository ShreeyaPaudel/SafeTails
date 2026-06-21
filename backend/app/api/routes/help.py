"""Help-request workflow: a responder offers help on a report; the reporter accepts/declines.

On accept the report moves to `being_helped`, the helper is recorded, and the helper earns points
(plus a First Responder badge for injured cases). This is how 'Start helping' on the dispatch
board reaches the person who filed the report.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.report import HelpRequest, Report
from app.models.user import User
from app.services import gamification

router = APIRouter()


class HelpCreate(BaseModel):
    message: str | None = None


class HelpItem(BaseModel):
    id: uuid.UUID
    report_id: uuid.UUID
    status: str
    message: str | None
    helper_name: str | None = None
    helper_avatar_url: str | None = None
    reporter_name: str | None = None
    species_label: str | None = None
    ward: str | None = None
    injured: bool = False


def _item(hr: HelpRequest, report: Report, helper: User, reporter: User | None = None) -> HelpItem:
    return HelpItem(
        id=hr.id, report_id=hr.report_id, status=hr.status, message=hr.message,
        helper_name=(helper.display_name or helper.username) if helper else None,
        helper_avatar_url=helper.avatar_url if helper else None,
        reporter_name=(reporter.display_name or reporter.username) if reporter else None,
        species_label=report.species_label if report else None,
        ward=report.ward if report else None,
        injured=(report.injury_status == "injured") if report else False,
    )


@router.post("/reports/{report_id}/help", response_model=HelpItem, status_code=201)
def offer_help(report_id: uuid.UUID, payload: HelpCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.reporter_id == user.id:
        raise HTTPException(status_code=400, detail="You can't offer help on your own report")
    existing = db.scalar(select(HelpRequest).where(HelpRequest.report_id == report_id, HelpRequest.helper_id == user.id))
    if existing is not None:
        raise HTTPException(status_code=409, detail="You already offered help on this report")
    hr = HelpRequest(report_id=report_id, helper_id=user.id, message=payload.message, status="pending")
    db.add(hr)
    db.commit()
    db.refresh(hr)
    return _item(hr, report, user)


@router.get("/help-requests/incoming", response_model=list[HelpItem])
def incoming(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Pending offers on reports I filed - the ones I can accept."""
    rows = db.execute(
        select(HelpRequest, Report, User)
        .join(Report, Report.id == HelpRequest.report_id)
        .join(User, User.id == HelpRequest.helper_id)
        .where(Report.reporter_id == user.id, HelpRequest.status == "pending")
        .order_by(HelpRequest.created_at.desc())
    ).all()
    return [_item(hr, rep, helper) for hr, rep, helper in rows]


@router.get("/help-requests/mine", response_model=list[HelpItem])
def mine(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(
        select(HelpRequest, Report).join(Report, Report.id == HelpRequest.report_id)
        .where(HelpRequest.helper_id == user.id).order_by(HelpRequest.created_at.desc())
    ).all()
    return [_item(hr, rep, user) for hr, rep in rows]


def _resolve(db: Session, request_id: uuid.UUID, user: User, accept: bool) -> HelpItem:
    hr = db.get(HelpRequest, request_id)
    if hr is None:
        raise HTTPException(status_code=404, detail="Help request not found")
    report = db.get(Report, hr.report_id)
    if report is None or report.reporter_id != user.id:
        raise HTTPException(status_code=403, detail="Only the reporter can respond to this offer")
    helper = db.get(User, hr.helper_id)
    if accept:
        from datetime import datetime, timezone

        hr.status = "accepted"
        report.status = "being_helped"
        report.helper_id = hr.helper_id
        if report.first_helped_at is None:
            report.first_helped_at = datetime.now(timezone.utc)
        if helper:
            gamification.award_points(db, helper, "helped", report_id=report.id)
            if report.injury_status == "injured":
                gamification.award_badge(db, helper, "first_responder")
                # Rapid-responder incentive: reaching an injured case quickly earns a bonus.
                from datetime import datetime, timezone, timedelta

                created = report.created_at
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) - created <= timedelta(minutes=gamification.RAPID_RESPONSE_MINUTES):
                    gamification.award_points(db, helper, "fast_response", report_id=report.id)
                    gamification.award_badge(db, helper, "rapid_responder")
            gamification.recompute_reputation(db, helper)
            gamification.check_and_award_badges(db, helper)
    else:
        hr.status = "declined"
    db.commit()
    db.refresh(hr)
    return _item(hr, report, helper)


@router.post("/help-requests/{request_id}/accept", response_model=HelpItem)
def accept(request_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _resolve(db, request_id, user, accept=True)


@router.post("/help-requests/{request_id}/decline", response_model=HelpItem)
def decline(request_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _resolve(db, request_id, user, accept=False)
