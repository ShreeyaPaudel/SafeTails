"""Peer confirmation / flagging - drives the reputation-weighted moderation workflow.

Community moderation works alongside the automated multi-factor spam engine (antispam.py):

  * A held (`pending_confirmation`) report PUBLISHES once it gathers enough peer confirmations
    and then earns its points.
  * A report accrues reputation-WEIGHTED spam/invalid flags (a trusted flagger counts more than
    a brand-new account). Enough weighted pressure first HIDES a published report for review, and
    past the reject threshold MARKS IT SPAM - penalising the reporter (severity-scaled) and
    rewarding the flaggers whose call was upheld.

All reputation-affecting paths recompute the affected users' reputation.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.report import Report, ReportConfirmation
from app.models.user import User
from app.services import gamification

VALID_VOTES = ("confirm", "flag_spam", "flag_invalid")

# Community-moderation thresholds (reputation-weighted; one average-reputation flag == weight 1.0).
FLAG_WEIGHT_REJECT = 2.0   # weighted spam pressure that MARKS a report as spam
FLAG_WEIGHT_REVIEW = 1.0   # weighted pressure that HIDES a published report for review
FLAG_MIN_DISTINCT = 2      # never act on a single flagger, however trusted


def _flag_weight(db: Session, report_id) -> tuple[float, int]:
    """(reputation-weighted flag pressure, distinct flagger count) for a report."""
    weight = db.scalar(
        select(func.coalesce(func.sum(User.reputation / 50.0), 0.0))
        .select_from(ReportConfirmation)
        .join(User, User.id == ReportConfirmation.user_id)
        .where(ReportConfirmation.report_id == report_id, ReportConfirmation.vote != "confirm")
    )
    count = db.scalar(
        select(func.count()).where(
            ReportConfirmation.report_id == report_id, ReportConfirmation.vote != "confirm"
        )
    )
    return float(weight or 0.0), int(count or 0)


def _reward_upheld_flaggers(db: Session, report_id, reporter_id) -> None:
    """When a report is confirmed spam, credit the community members who flagged it (their call
    was upheld) - this incentivises honest moderation without being farmable."""
    flaggers = db.scalars(
        select(User)
        .join(ReportConfirmation, ReportConfirmation.user_id == User.id)
        .where(ReportConfirmation.report_id == report_id, ReportConfirmation.vote != "confirm")
    ).all()
    for u in flaggers:
        if u.id == reporter_id:
            continue
        gamification.award_points(db, u, "moderation_help", report_id=report_id)
        gamification.recompute_reputation(db, u)
        gamification.check_and_award_badges(db, u)


def confirm_report(db: Session, report: Report, voter: User, vote: str) -> dict:
    if vote not in VALID_VOTES:
        raise HTTPException(status_code=400, detail=f"vote must be one of {VALID_VOTES}")
    if report.reporter_id == voter.id:
        raise HTTPException(status_code=400, detail="Cannot vote on your own report")

    existing = db.scalar(
        select(ReportConfirmation).where(
            ReportConfirmation.report_id == report.id, ReportConfirmation.user_id == voter.id
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="You have already voted on this report")

    db.add(ReportConfirmation(report_id=report.id, user_id=voter.id, vote=vote))
    db.flush()

    # Tiny reward to the voter for a genuine confirmation (kept small so it can't be farmed).
    if vote == "confirm":
        gamification.award_points(db, voter, "confirm_vote", report_id=report.id)
        gamification.recompute_reputation(db, voter)

    counts = dict(
        db.execute(
            select(ReportConfirmation.vote, func.count())
            .where(ReportConfirmation.report_id == report.id)
            .group_by(ReportConfirmation.vote)
        ).all()
    )
    confirm_count = counts.get("confirm", 0)
    flag_count = counts.get("flag_spam", 0) + counts.get("flag_invalid", 0)
    flag_weight, flag_distinct = _flag_weight(db, report.id)

    reporter = db.get(User, report.reporter_id)
    transition = None

    # Reward the REPORTER a small amount for EACH genuine confirmation (capped so it can't be
    # farmed): the more the community vouches for a sighting, the more trust + points it earns.
    if vote == "confirm" and confirm_count <= gamification.PEER_CONFIRM_CAP:
        gamification.award_points(db, reporter, "peer_confirmed", report_id=report.id)

    # 1. Reject (mark spam) on sufficient reputation-WEIGHTED flag pressure (takes precedence).
    if (
        flag_distinct >= FLAG_MIN_DISTINCT
        and flag_weight >= FLAG_WEIGHT_REJECT
        and report.moderation_state != "rejected"
    ):
        report.moderation_state = "rejected"
        consequences = gamification.apply_spam_consequences(db, reporter, report)
        _reward_upheld_flaggers(db, report.id, reporter.id)
        transition = "rejected"
    # 2. Publish a held report as soon as it reaches the confirmation threshold (a single peer
    #    confirmation for non-emergency reports; injured/severe already fast-tracked at submit).
    elif (
        report.moderation_state == "pending_confirmation"
        and confirm_count >= gamification.CONFIRM_THRESHOLD
    ):
        report.moderation_state = "published"
        gamification.award_points(db, reporter, "valid_report", report_id=report.id)
        if (
            report.species_user_override
            and report.species_label not in ("Unverified",)
            and report.species_user_override == report.species_label
        ):
            gamification.award_points(db, reporter, "ai_agreement", report_id=report.id)
        transition = "published"
    # 3. Hide a PUBLISHED report for review once weighted flags cross the (lower) review bar.
    elif (
        report.moderation_state == "published"
        and flag_distinct >= FLAG_MIN_DISTINCT
        and flag_weight >= FLAG_WEIGHT_REVIEW
    ):
        report.moderation_state = "pending_confirmation"
        transition = "under_review"

    gamification.recompute_reputation(db, reporter)
    gamification.check_and_award_badges(db, reporter)
    db.commit()
    db.refresh(report)
    return {
        "moderation_state": report.moderation_state,
        "confirm_count": confirm_count,
        "flag_count": flag_count,
        "flag_weight": round(flag_weight, 2),
        "transition": transition,
    }
