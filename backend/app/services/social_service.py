"""Social feed, likes, and comments (SDT relatedness)."""
from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.report import Report, ReportConfirmation
from app.models.social import Comment, Like
from app.models.user import User
from app.schemas.social import CommentAuthor, CommentOut, FeedItem, LikeResult
from app.services.report_service import to_public


def _like_count(db: Session, report_id: uuid.UUID) -> int:
    return int(db.scalar(select(func.count()).where(Like.report_id == report_id)) or 0)


def _comment_count(db: Session, report_id: uuid.UUID) -> int:
    return int(db.scalar(select(func.count()).where(Comment.report_id == report_id)) or 0)


def get_feed(db: Session, viewer: User | None, limit: int, offset: int) -> list[FeedItem]:
    # Published reports are visible to everyone. Reports awaiting community verification
    # (`pending_confirmation`) are ALSO shown to any signed-in member so they can review and
    # confirm them - this is what drives the verification workflow (they carry a clear status
    # label in the UI). Rejected reports stay hidden from the feed for everyone (the author still
    # sees their own held/rejected reports on the My Reports page).
    if viewer is not None:
        visible = or_(
            Report.moderation_state.in_(("published", "pending_confirmation")),
            and_(Report.reporter_id == viewer.id, Report.moderation_state != "rejected"),
        )
    else:
        visible = Report.moderation_state == "published"
    reports = db.scalars(
        select(Report)
        .options(selectinload(Report.reporter))  # avoid N+1 reporter lookups in to_public()
        .where(visible)
        .order_by(Report.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    if not reports:
        return []
    ids = [r.id for r in reports]

    like_counts = dict(
        db.execute(
            select(Like.report_id, func.count()).where(Like.report_id.in_(ids)).group_by(Like.report_id)
        ).all()
    )
    comment_counts = dict(
        db.execute(
            select(Comment.report_id, func.count())
            .where(Comment.report_id.in_(ids))
            .group_by(Comment.report_id)
        ).all()
    )
    liked_ids: set = set()
    if viewer is not None:
        liked_ids = {
            r for (r,) in db.execute(
                select(Like.report_id).where(Like.report_id.in_(ids), Like.user_id == viewer.id)
            ).all()
        }

    # Peer-confirmation tallies (confirm vs flag) + which reports the viewer confirmed.
    confirm_counts: dict = {}
    flag_counts: dict = {}
    for rid, vote, cnt in db.execute(
        select(ReportConfirmation.report_id, ReportConfirmation.vote, func.count())
        .where(ReportConfirmation.report_id.in_(ids))
        .group_by(ReportConfirmation.report_id, ReportConfirmation.vote)
    ).all():
        if vote == "confirm":
            confirm_counts[rid] = confirm_counts.get(rid, 0) + cnt
        else:
            flag_counts[rid] = flag_counts.get(rid, 0) + cnt
    confirmed_by_me: set = set()
    if viewer is not None:
        confirmed_by_me = {
            r for (r,) in db.execute(
                select(ReportConfirmation.report_id).where(
                    ReportConfirmation.report_id.in_(ids),
                    ReportConfirmation.user_id == viewer.id,
                    ReportConfirmation.vote == "confirm",
                )
            ).all()
        }

    return [
        FeedItem(
            report=to_public(r),
            like_count=int(like_counts.get(r.id, 0)),
            comment_count=int(comment_counts.get(r.id, 0)),
            liked_by_me=r.id in liked_ids,
            confirm_count=int(confirm_counts.get(r.id, 0)),
            flag_count=int(flag_counts.get(r.id, 0)),
            confirmed_by_me=r.id in confirmed_by_me,
        )
        for r in reports
    ]


def confirmation_info(db: Session, report_id: uuid.UUID, viewer: User | None) -> dict:
    """Counts + the list of people who confirmed/flagged a report, for the report detail view."""
    rows = db.execute(
        select(ReportConfirmation, User)
        .join(User, User.id == ReportConfirmation.user_id)
        .where(ReportConfirmation.report_id == report_id)
        .order_by(ReportConfirmation.created_at.desc())
    ).all()
    confirmers = [
        {
            "id": u.id, "display_name": u.display_name or u.username, "username": u.username,
            "avatar_url": u.avatar_url, "vote": c.vote, "created_at": c.created_at,
        }
        for c, u in rows
    ]
    confirm_count = sum(1 for c, _ in rows if c.vote == "confirm")
    flag_count = sum(1 for c, _ in rows if c.vote != "confirm")
    my_vote = None
    if viewer is not None:
        my_vote = next((c.vote for c, _ in rows if c.user_id == viewer.id), None)
    return {
        "confirm_count": confirm_count,
        "flag_count": flag_count,
        "confirmed_by_me": my_vote == "confirm",
        "my_vote": my_vote,
        "confirmers": confirmers,
    }


def reports_confirmed_by(db: Session, user: User) -> list:
    """Published reports this user has confirmed (their contribution history)."""
    reports = db.scalars(
        select(Report)
        .join(ReportConfirmation, ReportConfirmation.report_id == Report.id)
        .options(selectinload(Report.reporter))
        .where(ReportConfirmation.user_id == user.id, ReportConfirmation.vote == "confirm")
        .order_by(ReportConfirmation.created_at.desc())
    ).all()
    return [to_public(r) for r in reports]


def _get_report_or_404(db: Session, report_id: uuid.UUID) -> Report:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


def like(db: Session, report_id: uuid.UUID, user: User) -> LikeResult:
    _get_report_or_404(db, report_id)
    existing = db.scalar(
        select(Like).where(Like.report_id == report_id, Like.user_id == user.id)
    )
    if existing is None:
        db.add(Like(report_id=report_id, user_id=user.id))
        db.commit()
    return LikeResult(like_count=_like_count(db, report_id), liked=True)


def unlike(db: Session, report_id: uuid.UUID, user: User) -> LikeResult:
    _get_report_or_404(db, report_id)
    existing = db.scalar(
        select(Like).where(Like.report_id == report_id, Like.user_id == user.id)
    )
    if existing is not None:
        db.delete(existing)
        db.commit()
    return LikeResult(like_count=_like_count(db, report_id), liked=False)


def add_comment(db: Session, report_id: uuid.UUID, user: User, body: str) -> CommentOut:
    _get_report_or_404(db, report_id)
    body = (body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    comment = Comment(report_id=report_id, user_id=user.id, body=body)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return CommentOut(
        id=comment.id,
        report_id=comment.report_id,
        author=CommentAuthor.model_validate(user),
        body=comment.body,
        created_at=comment.created_at,
    )


def list_comments(db: Session, report_id: uuid.UUID) -> list[CommentOut]:
    rows = db.execute(
        select(Comment, User)
        .join(User, User.id == Comment.user_id)
        .where(Comment.report_id == report_id)
        .order_by(Comment.created_at.asc())
    ).all()
    return [
        CommentOut(
            id=c.id,
            report_id=c.report_id,
            author=CommentAuthor.model_validate(u),
            body=c.body,
            created_at=c.created_at,
        )
        for c, u in rows
    ]
