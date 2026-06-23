"""Real-time notifications, derived live from database state (no static seed data).

Rather than a separate events table, notifications are computed on demand from the reports the
user cares about: emergencies (injured), resolutions, their own published reports, and new
sightings in their saved ward. The frontend polls this endpoint, so alerts stay current without
a manual refresh. Read/unread state is tracked client-side (localStorage) against stable ids.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.gamification import Badge, UserBadge
from app.models.report import HelpRequest, PointEvent, Report
from app.models.user import User

router = APIRouter()

_WINDOW_DAYS = 14
_LIMIT = 80

# Friendly copy for each points reason (shown in the Alerts feed).
_REASON_LABELS = {
    "valid_report": "your report was published",
    "injury_report": "you reported an emergency case",
    "ai_agreement": "your species label matched the AI",
    "peer_confirmed": "your report was peer-confirmed",
    "confirm_vote": "you confirmed a sighting",
    "helped": "you helped resolve a case",
    "resolved": "your report reached resolved",
    "spam_penalty": "a report was flagged as spam",
    "injury_spam_penalty": "an emergency report was rejected as spam",
    "severe_spam_penalty": "a fake severe-injury report was rejected as spam",
    "fast_response": "you reached an injured case quickly",
    "streak_bonus": "you kept your reporting streak alive",
    "moderation_help": "your spam flag was upheld by the community",
}


@router.get("/notifications")
def list_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(days=_WINDOW_DAYS)
    reports = db.scalars(
        select(Report)
        .where(Report.moderation_state == "published", Report.created_at >= since)
        .order_by(Report.created_at.desc())
        .limit(120)
    ).all()

    items: list[dict] = []
    for r in reports:
        sp = (r.species_user_override or r.species_label or "animal").lower()
        ward = r.ward or "the valley"
        ts = r.created_at.isoformat()
        mine = r.reporter_id == user.id
        if r.status == "resolved":
            items.append({
                "id": f"{r.id}:resolved", "kind": "system", "icon": "check", "accent": "var(--green)",
                "title": "Case resolved", "report_id": str(r.id), "created_at": ts,
                "body": f"A {sp} case in {ward} was marked resolved. Thank you to everyone who helped.",
            })
        elif r.injury_status == "injured":
            items.append({
                "id": f"{r.id}:emergency", "kind": "dispatch", "icon": "cross", "accent": "var(--coral-600)",
                "title": "Emergency: injured animal", "report_id": str(r.id), "created_at": ts,
                "body": f"An injured {sp} was reported in {ward} and needs a responder.",
            })
        elif mine:
            items.append({
                "id": f"{r.id}:mine", "kind": "confirm", "icon": "paw", "accent": "var(--green)",
                "title": "Your report is live", "report_id": str(r.id), "created_at": ts,
                "body": f"Your {sp} report in {ward} is published on the map.",
            })
        elif user.default_ward and r.ward == user.default_ward:
            items.append({
                "id": f"{r.id}:near", "kind": "confirm", "icon": "location", "accent": "var(--sp-buffalo)",
                "title": "New sighting near you", "report_id": str(r.id), "created_at": ts,
                "body": f"A {sp} was reported in {ward}, close to your saved area.",
            })

    # Help offers accepted on the current user's help requests (you can now go help).
    accepted = db.scalars(
        select(HelpRequest)
        .where(HelpRequest.helper_id == user.id, HelpRequest.status == "accepted", HelpRequest.created_at >= since)
        .order_by(HelpRequest.created_at.desc())
        .limit(20)
    ).all()
    for h in accepted:
        items.append({
            "id": f"{h.id}:accepted", "kind": "dispatch", "icon": "checkSmall", "accent": "var(--green)",
            "title": "Your help offer was accepted", "report_id": str(h.report_id),
            "created_at": h.created_at.isoformat(),
            "body": "The reporter accepted your offer. You can coordinate and help now.",
        })

    # Points you earned/lost (gamification feedback in the Alerts feed).
    for p in db.scalars(
        select(PointEvent)
        .where(PointEvent.user_id == user.id, PointEvent.created_at >= since)
        .order_by(PointEvent.created_at.desc())
        .limit(50)
    ).all():
        positive = p.delta >= 0
        items.append({
            "id": f"pt:{p.id}", "kind": "points",
            "icon": "zap" if positive else "alert",
            "accent": "var(--gold-600)" if positive else "var(--coral-600)",
            "title": f"{'+' if positive else ''}{p.delta} points",
            "report_id": str(p.report_id) if p.report_id else None,
            "created_at": p.created_at.isoformat(),
            "body": f"{'You earned' if positive else 'Points adjusted by'} {abs(p.delta)} points - {_REASON_LABELS.get(p.reason, p.reason)}.",
        })

    # Comments other people left on YOUR reports (community interaction).
    from app.models.report import ReportConfirmation
    from app.models.social import Comment

    my_report_ids = [r for (r,) in db.execute(select(Report.id).where(Report.reporter_id == user.id)).all()]
    if my_report_ids:
        for c, cu, rep in db.execute(
            select(Comment, User, Report)
            .join(User, User.id == Comment.user_id)
            .join(Report, Report.id == Comment.report_id)
            .where(Comment.report_id.in_(my_report_ids), Comment.user_id != user.id, Comment.created_at >= since)
            .order_by(Comment.created_at.desc())
            .limit(20)
        ).all():
            items.append({
                "id": f"cmt:{c.id}", "kind": "comment", "icon": "comment", "accent": "var(--sp-buffalo)",
                "title": "New comment on your report",
                "report_id": str(c.report_id), "created_at": c.created_at.isoformat(),
                "body": f"{cu.display_name or cu.username} commented: \"{(c.body or '')[:80]}\"",
            })

        # Peer confirmations on YOUR reports (a clear 'your sighting was verified' alert).
        for cf, cu in db.execute(
            select(ReportConfirmation, User)
            .join(User, User.id == ReportConfirmation.user_id)
            .where(ReportConfirmation.report_id.in_(my_report_ids), ReportConfirmation.vote == "confirm",
                   ReportConfirmation.user_id != user.id, ReportConfirmation.created_at >= since)
            .order_by(ReportConfirmation.created_at.desc())
            .limit(20)
        ).all():
            items.append({
                "id": f"cf:{cf.id}", "kind": "confirm", "icon": "checkSmall", "accent": "var(--green)",
                "title": "Your sighting was confirmed",
                "report_id": str(cf.report_id), "created_at": cf.created_at.isoformat(),
                "body": f"{cu.display_name or cu.username} confirmed one of your reports. More confirmations boost your trust and points.",
            })

    # Badges you earned.
    for ub, b in db.execute(
        select(UserBadge, Badge)
        .join(Badge, Badge.id == UserBadge.badge_id)
        .where(UserBadge.user_id == user.id, UserBadge.awarded_at.is_not(None), UserBadge.awarded_at >= since)
        .order_by(UserBadge.awarded_at.desc())
    ).all():
        items.append({
            "id": f"badge:{ub.id}", "kind": "badge", "icon": "award", "accent": "var(--gold-600)",
            "title": f"Badge earned: {b.name}", "report_id": None,
            "created_at": ub.awarded_at.isoformat(),
            "body": f"You earned the \"{b.name}\" badge - {b.description}.",
        })

    # Respect the user's notification preferences (Settings): drop categories they've turned off.
    prefs = user.preferences or {}

    def _allowed(it: dict) -> bool:
        # Rescue & dispatch (urgent / emergency / help offers)
        if prefs.get("pushUrgent", True) is False and it["kind"] == "dispatch":
            return False
        # Confirmations & activity on my reports (published, nearby, confirmed)
        if prefs.get("pushConfirm", True) is False and it["kind"] == "confirm":
            return False
        # Community interactions (comments)
        if prefs.get("pushComment", True) is False and it["kind"] == "comment":
            return False
        # Achievements: points + badges
        if prefs.get("pushAchievements", True) is False and it["kind"] in ("points", "badge"):
            return False
        return True

    items = [it for it in items if _allowed(it)]
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items[:_LIMIT]
