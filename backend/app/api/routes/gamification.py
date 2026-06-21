"""Leaderboard, user profiles, and badges."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.models.gamification import Badge, UserBadge
from app.models.report import Report
from app.models.user import User
from app.schemas.gamification import BadgeOut, LeaderboardEntry, ProfileOut, ProfileStats
from app.schemas.report import ReportPublic
from app.schemas.user import UserPublic
from app.services.report_service import to_public

router = APIRouter()


@router.get("/users/{user_id}/points-history")
def points_history(user_id: uuid.UUID, days: int = Query(30, ge=7, le=120), db: Session = Depends(get_db)) -> dict:
    """Daily points earned + running total over the last `days`, from the PointEvent audit trail.
    Powers the profile 'reputation & points growth' chart (real progression, not a snapshot)."""
    from datetime import datetime, timedelta, timezone

    from app.models.report import PointEvent

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    # Points accumulated BEFORE the window (the starting baseline for the running total).
    baseline = int(db.scalar(
        select(func.coalesce(func.sum(PointEvent.delta), 0)).where(
            PointEvent.user_id == user_id, PointEvent.created_at < cutoff
        )
    ) or 0)
    rows = db.execute(
        select(func.date(PointEvent.created_at), func.sum(PointEvent.delta))
        .where(PointEvent.user_id == user_id, PointEvent.created_at >= cutoff)
        .group_by(func.date(PointEvent.created_at))
    ).all()
    by_day: dict[str, int] = {}
    for d, total in rows:
        key = d if isinstance(d, str) else d.isoformat()
        by_day[key] = int(total or 0)

    series = []
    running = baseline
    for i in range(days - 1, -1, -1):
        day = (now - timedelta(days=i)).date()
        gained = by_day.get(day.isoformat(), 0)
        running += gained
        series.append({
            "day": "Today" if i == 0 else day.strftime("%b %d"),
            "gained": gained,
            "points": max(running, 0),
        })
    return {"baseline": baseline, "days": days, "series": series}


@router.get("/users/{user_id}/reports", response_model=list[ReportPublic])
def user_reports(
    user_id: uuid.UUID,
    limit: int = Query(12, ge=1, le=60),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """A user's published reports, newest first, paginated - powers the COMPLETE profile history
    (lazy-loaded page by page) so nothing is capped at a fixed number of entries."""
    reports = db.scalars(
        select(Report)
        .options(selectinload(Report.reporter))
        .where(Report.reporter_id == user_id, Report.moderation_state == "published")
        .order_by(Report.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return [to_public(r) for r in reports]


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(
    limit: int = Query(50, le=200),
    period: str = Query("all", pattern="^(all|week)$"),
    db: Session = Depends(get_db),
):
    """Ranked reporters. `period=all` ranks by lifetime points; `period=week` ranks by points
    EARNED in the last 7 days (summed from the PointEvent audit trail) so it's a true weekly board."""
    from datetime import datetime, timedelta, timezone

    from app.models.report import PointEvent

    if period == "week":
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        weekly = dict(
            db.execute(
                select(PointEvent.user_id, func.sum(PointEvent.delta))
                .where(PointEvent.created_at >= cutoff, PointEvent.delta > 0)
                .group_by(PointEvent.user_id)
                .order_by(func.sum(PointEvent.delta).desc())
                .limit(limit)
            ).all()
        )
        users = db.scalars(select(User).where(User.id.in_(list(weekly.keys())))).all() if weekly else []
        # order users by their weekly total (desc)
        users = sorted(users, key=lambda u: -int(weekly.get(u.id, 0)))
    else:
        weekly = None
        # Fetch a buffer, then drop users who opted OUT of the public leaderboard (privacy setting),
        # so the toggle has a real effect. Default (no preference) = visible.
        users = db.scalars(
            select(User).order_by(User.points.desc(), User.reputation.desc()).limit(limit * 2)
        ).all()
    users = [u for u in users if (u.preferences or {}).get("publicProfile", True) is not False][:limit]
    ids = [u.id for u in users]
    counts: dict = {}
    wards: dict = {}
    if ids:
        counts = dict(
            db.execute(
                select(Report.reporter_id, func.count())
                .where(Report.reporter_id.in_(ids), Report.moderation_state == "published")
                .group_by(Report.reporter_id)
            ).all()
        )
        # most-frequent published ward per user
        ward_rows = db.execute(
            select(Report.reporter_id, Report.ward, func.count())
            .where(Report.reporter_id.in_(ids), Report.moderation_state == "published", Report.ward.is_not(None))
            .group_by(Report.reporter_id, Report.ward)
        ).all()
        best: dict = {}
        for uid, ward, c in ward_rows:
            if ward and (uid not in best or c > best[uid][1]):
                best[uid] = (ward, c)
        wards = {uid: v[0] for uid, v in best.items()}
    out = []
    for u in users:
        entry = LeaderboardEntry.model_validate(u)
        entry.reports_count = int(counts.get(u.id, 0))
        entry.ward = wards.get(u.id)
        # For the weekly board, surface points EARNED this week (not the lifetime total).
        if weekly is not None:
            entry.points = int(weekly.get(u.id, 0))
        out.append(entry)
    return out


def _badges_for(db: Session, user_id: uuid.UUID) -> list[BadgeOut]:
    rows = db.execute(
        select(Badge.code, Badge.name, Badge.description, UserBadge.awarded_at)
        .join(UserBadge, UserBadge.badge_id == Badge.id)
        .where(UserBadge.user_id == user_id)
        .order_by(UserBadge.awarded_at)
    ).all()
    return [BadgeOut(code=c, name=n, description=d, awarded_at=a) for c, n, d, a in rows]


@router.get("/users/{user_id}/badges", response_model=list[BadgeOut])
def user_badges(user_id: uuid.UUID, db: Session = Depends(get_db)):
    return _badges_for(db, user_id)


@router.get("/users/{user_id}/profile", response_model=ProfileOut)
def user_profile(user_id: uuid.UUID, db: Session = Depends(get_db)):
    from app.services import gamification

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    reports = db.scalars(select(Report).where(Report.reporter_id == user_id)).all()
    published = [r for r in reports if r.moderation_state == "published"]
    from datetime import datetime, timezone

    suspended = bool(
        user.suspended_until
        and (user.suspended_until.replace(tzinfo=timezone.utc) if user.suspended_until.tzinfo is None else user.suspended_until)
        > datetime.now(timezone.utc)
    )
    stats = ProfileStats(
        total_reports=len(reports),
        published_reports=len(published),
        distinct_wards=len({r.ward for r in published if r.ward}),
        resolved_reports=sum(1 for r in published if r.status == "resolved"),
        helped_count=int(db.scalar(select(func.count()).where(Report.helper_id == user_id)) or 0),
        reporting_streak=gamification.reporting_streak(db, user),
        spam_strikes=int(user.spam_strikes or 0),
        suspended=suspended,
    )
    earned = _badges_for(db, user_id)
    earned_codes = {b.code for b in earned}
    all_badges = [
        {"code": c, "name": n, "description": d, "earned": c in earned_codes,
         "negative": c in gamification.NEGATIVE_BADGES}
        for c, n, d in gamification.BADGE_DEFS
    ]
    inp = gamification.gather_reputation_inputs(db, user)
    rep_bd = {
        "confirmation_rate": round(inp.confirmed / inp.total * 100) if inp.total else 0,
        "ai_agreement_rate": round(inp.agreed / inp.labelled * 100) if inp.labelled else 0,
        "flag_rate": round(inp.flagged / inp.total * 100) if inp.total else 0,
        "confirmed": inp.confirmed, "total": inp.total,
    }
    # rank = position by points among all users
    rank = db.scalar(select(func.count()).where(User.points > user.points)) or 0
    return ProfileOut(
        user=UserPublic.model_validate(user),
        badges=earned,
        all_badges=all_badges,
        reputation_breakdown=rep_bd,
        rank=int(rank) + 1,
        stats=stats,
    )
