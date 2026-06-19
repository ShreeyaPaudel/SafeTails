"""Coordination chat between a report's reporter and its accepted helper(s).

A thread exists per report; only the reporter and users whose help offer was ACCEPTED may read
or post. The frontend polls these endpoints (same cadence as notifications) for near-real-time.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.message import Message
from app.models.report import HelpRequest, Report
from app.models.user import User

router = APIRouter()


class MessageCreate(BaseModel):
    body: str


def _get_report(db: Session, report_id: uuid.UUID) -> Report:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


def _can_chat(db: Session, report: Report, user: User) -> bool:
    if report.reporter_id == user.id:
        return True
    hr = db.scalar(
        select(HelpRequest).where(
            HelpRequest.report_id == report.id,
            HelpRequest.helper_id == user.id,
            HelpRequest.status == "accepted",
        )
    )
    return hr is not None


def _participants(db: Session, report: Report) -> list[dict]:
    """Reporter + accepted helpers (the people in this thread)."""
    ids = {report.reporter_id}
    for (hid,) in db.execute(
        select(HelpRequest.helper_id).where(HelpRequest.report_id == report.id, HelpRequest.status == "accepted")
    ).all():
        ids.add(hid)
    users = db.scalars(select(User).where(User.id.in_(ids))).all()
    return [
        {
            "id": str(u.id), "name": u.display_name or u.username, "avatar_url": u.avatar_url,
            "role": "reporter" if u.id == report.reporter_id else "helper",
        }
        for u in users
    ]


def _serialise(db: Session, report: Report) -> list[dict]:
    rows = db.execute(
        select(Message, User)
        .join(User, User.id == Message.sender_id)
        .where(Message.report_id == report.id)
        .order_by(Message.created_at.asc())
    ).all()
    return [
        {
            "id": str(m.id), "sender_id": str(m.sender_id),
            "sender_name": u.display_name or u.username, "sender_avatar": u.avatar_url,
            "body": m.body, "created_at": m.created_at.isoformat(),
        }
        for m, u in rows
    ]


@router.get("/reports/{report_id}/messages")
def list_messages(report_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    report = _get_report(db, report_id)
    if not _can_chat(db, report, user):
        raise HTTPException(status_code=403, detail="Only the reporter and accepted helpers can view this chat.")
    return {"can_chat": True, "participants": _participants(db, report), "messages": _serialise(db, report)}


@router.post("/reports/{report_id}/messages")
def send_message(
    report_id: uuid.UUID,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    report = _get_report(db, report_id)
    if not _can_chat(db, report, user):
        raise HTTPException(status_code=403, detail="Only the reporter and accepted helpers can post here.")
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    db.add(Message(report_id=report.id, sender_id=user.id, body=body[:2000]))
    db.commit()
    return {"can_chat": True, "participants": _participants(db, report), "messages": _serialise(db, report)}


@router.get("/conversations")
def my_conversations(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    """Reports where the user can chat: their own reports that have an accepted helper, or reports
    where the user's help offer was accepted."""
    # reports I own that have >=1 accepted helper
    owned = select(Report.id).join(HelpRequest, HelpRequest.report_id == Report.id).where(
        Report.reporter_id == user.id, HelpRequest.status == "accepted"
    )
    helping = select(Report.id).join(HelpRequest, HelpRequest.report_id == Report.id).where(
        HelpRequest.helper_id == user.id, HelpRequest.status == "accepted"
    )
    report_ids = {rid for (rid,) in db.execute(owned.union(helping)).all()}
    if not report_ids:
        return []
    reports = db.scalars(select(Report).where(Report.id.in_(report_ids)).order_by(Report.created_at.desc())).all()
    out = []
    for r in reports:
        last = db.scalar(
            select(Message).where(Message.report_id == r.id).order_by(Message.created_at.desc()).limit(1)
        )
        out.append({
            "report_id": str(r.id),
            "species_label": r.species_user_override or r.species_label,
            "ward": r.ward,
            "role": "reporter" if r.reporter_id == user.id else "helper",
            "last_message": last.body if last else None,
            "last_at": last.created_at.isoformat() if last else None,
            "participants": _participants(db, r),
        })
    return out
