"""Gamification: points, levels, reputation, badges.

Pure functions (points/level/reputation maths) are separated from DB I/O so they can be unit
tested directly - these are thesis-critical correctness areas. Design + formulas:
docs/GAMIFICATION.md.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.gamification import Badge, UserBadge
from app.models.report import PointEvent, Report, ReportConfirmation
from app.models.user import User

# --- Points -----------------------------------------------------------------
# Design (docs/GAMIFICATION.md): reward reporting and *helping* generously, reward injured/
# emergency reports the most, but keep confirming-others a tiny reward so it can't be farmed.
POINTS: dict[str, int] = {
    "valid_report": 10,          # a normal published report
    "injury_report": 20,         # injured/emergency report - worth more
    "ai_agreement": 5,           # your label matched the model
    "peer_confirmed": 3,         # per confirming peer, capped (goes to the REPORTER)
    "confirm_vote": 2,           # tiny reward to the VOTER for confirming someone else (anti-farm)
    "helped": 15,                # you helped/resolved a rescue case
    "resolved": 15,              # your report reached resolved
    "fast_response": 10,         # helper reached an injured case quickly (rapid-responder bonus)
    "streak_bonus": 5,          # kept a daily reporting/helping streak alive
    "moderation_help": 3,        # your spam flag on someone else's report stuck (community mod)
    "spam_penalty": -8,          # per spam/invalid flag that sticks (base, non-injury)
    "injury_spam_penalty": -25,  # an injured report you filed was rejected as spam (heavy)
    "severe_spam_penalty": -40,  # a FAKE severe-injury emergency - the most damaging abuse
}
PEER_CONFIRM_CAP = 3

# Escalating posting cooldowns by cumulative confirmed-spam strike count (hours). The first
# strike is a warning (no lockout); repeat offenders face progressively longer suspensions.
SPAM_COOLDOWN_HOURS = {2: 1, 3: 24, 4: 72, 5: 168}  # 5+ -> 168h (1 week)
RAPID_RESPONSE_MINUTES = 120  # helping an injured case within this window earns fast_response

# --- Reputation -------------------------------------------------------------
REP_WEIGHTS = (0.4, 0.3, 0.3)  # confirmation_rate, ai_agreement_rate, (1 - flag_rate)
REP_PRIOR = 0.5
REP_PSEUDO_COUNT = 5  # Bayesian smoothing so a single early event doesn't swing the score
# A single peer confirmation publishes a held (non-emergency) report. Additional confirmations
# are still rewarded (more trust + points for the reporter) - see confirm_report.
CONFIRM_THRESHOLD = 1  # peer confirmations needed to publish / count as confirmed
FLAG_THRESHOLD = 2     # flags needed to reject


def level_for_points(points: int) -> int:
    """Sub-linear level curve (SDT competence): fast early, leaderboard not volume-dominated."""
    return int(math.floor(math.sqrt(max(points, 0) / 50))) + 1


def _smoothed_rate(positive: int, total: int) -> float:
    return (positive + REP_PSEUDO_COUNT * REP_PRIOR) / (total + REP_PSEUDO_COUNT)


def compute_reputation(
    confirmed: int,
    eligible: int,
    agreed: int,
    labelled: int,
    flagged: int,
    total: int,
) -> float:
    """Reputation 0-100 from behavioural rates (Bayesian-smoothed). New user (all zero) -> 50."""
    wc, wa, wf = REP_WEIGHTS
    confirmation_rate = _smoothed_rate(confirmed, eligible)
    ai_agreement_rate = _smoothed_rate(agreed, labelled)
    flag_rate = _smoothed_rate(flagged, total)
    score = wc * confirmation_rate + wa * ai_agreement_rate + wf * (1 - flag_rate)
    return round(100 * min(max(score, 0.0), 1.0), 2)


@dataclass
class ReputationInputs:
    confirmed: int
    eligible: int
    agreed: int
    labelled: int
    flagged: int
    total: int


# --- DB-driven operations ---------------------------------------------------
def award_points(db: Session, user: User, reason: str, report_id=None, amount: int | None = None) -> int:
    """Record a PointEvent and update the user's points + level. Returns the delta applied."""
    delta = amount if amount is not None else POINTS.get(reason, 0)
    db.add(PointEvent(user_id=user.id, report_id=report_id, delta=delta, reason=reason))
    user.points = max(0, user.points + delta)
    user.level = level_for_points(user.points)
    db.flush()
    return delta


def spam_penalty_reason(report: "Report") -> str:
    """Severity-scaled penalty: faking a severe emergency costs far more than a low-priority spam.

    Severity mirrors the app-wide rule (injury_confidence >= 0.85 == severe)."""
    if report.injury_status == "injured":
        conf = report.injury_confidence if report.injury_confidence is not None else 0.7
        return "severe_spam_penalty" if conf >= 0.85 else "injury_spam_penalty"
    return "spam_penalty"


def apply_spam_consequences(db: Session, reporter: User, report: "Report") -> dict:
    """A report was CONFIRMED as spam: apply a severity-scaled points/reputation penalty, add a
    strike, and escalate to a posting cooldown for repeat offenders. Returns a summary dict."""
    from datetime import datetime, timedelta, timezone

    reason = spam_penalty_reason(report)
    delta = award_points(db, reporter, reason, report_id=report.id)
    reporter.spam_strikes = int(reporter.spam_strikes or 0) + 1
    if report.injury_status == "injured":
        award_badge(db, reporter, "false_alarm")

    cooldown_h = 0
    for threshold in sorted(SPAM_COOLDOWN_HOURS):
        if reporter.spam_strikes >= threshold:
            cooldown_h = SPAM_COOLDOWN_HOURS[threshold]
    if cooldown_h:
        reporter.suspended_until = datetime.now(timezone.utc) + timedelta(hours=cooldown_h)
    db.flush()
    return {"reason": reason, "delta": delta, "strikes": reporter.spam_strikes, "cooldown_hours": cooldown_h}


def reporting_streak(db: Session, user: User) -> int:
    """Consecutive days (up to today/yesterday) with at least one report - a light engagement
    signal used for streak rewards + the profile. Counts by distinct UTC report day."""
    from datetime import datetime, timezone

    rows = db.execute(
        select(func.date(Report.created_at)).where(Report.reporter_id == user.id)
    ).all()
    days = {r[0] for r in rows if r[0] is not None}
    if not days:
        return 0
    # Normalise to date objects (SQLite returns str, Postgres returns date).
    norm = set()
    for d in days:
        norm.add(d if hasattr(d, "toordinal") else datetime.fromisoformat(str(d)).date())
    today = datetime.now(timezone.utc).date()
    from datetime import timedelta as _td
    if today not in norm and (today - _td(days=1)) not in norm:
        return 0
    streak = 0
    cursor = today if today in norm else today - _td(days=1)
    while cursor in norm:
        streak += 1
        cursor -= _td(days=1)
    return streak


def gather_reputation_inputs(db: Session, user: User) -> ReputationInputs:
    """Aggregate the user's history into the inputs for `compute_reputation`."""
    report_rows = db.execute(
        select(Report.id, Report.species_label, Report.species_user_override, Report.moderation_state)
        .where(Report.reporter_id == user.id)
    ).all()
    total = len(report_rows)
    report_ids = [r.id for r in report_rows]
    labelled = sum(1 for r in report_rows if r.species_user_override)
    agreed = sum(
        1 for r in report_rows
        if r.species_user_override and r.species_user_override == r.species_label
    )

    # confirmation / flag vote counts per report
    confirm_counts: dict = {}
    flag_counts: dict = {}
    if report_ids:
        rows = db.execute(
            select(ReportConfirmation.report_id, ReportConfirmation.vote, func.count())
            .where(ReportConfirmation.report_id.in_(report_ids))
            .group_by(ReportConfirmation.report_id, ReportConfirmation.vote)
        ).all()
        for rid, vote, cnt in rows:
            if vote == "confirm":
                confirm_counts[rid] = confirm_counts.get(rid, 0) + cnt
            else:  # flag_spam | flag_invalid
                flag_counts[rid] = flag_counts.get(rid, 0) + cnt

    confirmed = sum(1 for r in report_rows if confirm_counts.get(r.id, 0) >= CONFIRM_THRESHOLD)
    flagged = sum(
        1 for r in report_rows
        if flag_counts.get(r.id, 0) >= FLAG_THRESHOLD or r.moderation_state == "rejected"
    )
    return ReputationInputs(confirmed, total, agreed, labelled, flagged, total)


def recompute_reputation(db: Session, user: User) -> float:
    inp = gather_reputation_inputs(db, user)
    user.reputation = compute_reputation(
        inp.confirmed, inp.eligible, inp.agreed, inp.labelled, inp.flagged, inp.total
    )
    db.flush()
    return user.reputation


# --- Badges -----------------------------------------------------------------
# (code, name, description). Criteria evaluated in `check_and_award_badges`.
BADGE_DEFS = [
    ("first_report", "First Report", "Submitted your first published report"),
    ("reporter_10", "Active Reporter", "10 published reports"),
    ("reporter_50", "Dedicated Reporter", "50 published reports"),
    ("ward_explorer", "Ward Explorer", "Reported in 5+ distinct wards"),
    ("verified_reporter", "Verified Reporter", "Reputation reached 80"),
    ("pillar_of_trust", "Pillar of Trust", "Reputation reached 95 - a most-trusted reporter"),
    ("helper", "Helper", "3+ reports reached resolved"),
    ("first_responder", "First Responder", "Helped resolve an injured/emergency case"),
    ("top_helper", "Top Helper", "Assisted on 10+ rescue cases"),
    ("rapid_responder", "Rapid Responder", "Reached an injured case within 2 hours"),
    ("on_a_roll", "On a Roll", "Kept a 7-day reporting streak"),
    ("community_guardian", "Community Guardian", "5+ of your spam flags were upheld"),
    ("false_alarm", "False Alarm", "An injured report you filed was rejected as spam"),  # negative
]
NEGATIVE_BADGES = {"false_alarm"}


def award_badge(db: Session, user: User, code: str) -> bool:
    """Directly award a specific (often event-based / negative) badge if not already held."""
    ensure_badges_seeded(db)
    badge = db.scalar(select(Badge).where(Badge.code == code))
    if badge is None:
        return False
    has = db.scalar(
        select(UserBadge).where(UserBadge.user_id == user.id, UserBadge.badge_id == badge.id)
    )
    if has is not None:
        return False
    db.add(UserBadge(user_id=user.id, badge_id=badge.id))
    db.flush()
    return True


def ensure_badges_seeded(db: Session) -> None:
    existing = {b.code for b in db.scalars(select(Badge)).all()}
    for code, name, desc in BADGE_DEFS:
        if code not in existing:
            db.add(Badge(code=code, name=name, description=desc))
    db.flush()


def check_and_award_badges(db: Session, user: User) -> list[str]:
    """Award any newly-earned badges. Returns codes awarded this call."""
    ensure_badges_seeded(db)
    published = db.scalars(
        select(Report).where(Report.reporter_id == user.id, Report.moderation_state == "published")
    ).all()
    n_published = len(published)
    distinct_wards = len({r.ward for r in published if r.ward})
    n_resolved = sum(1 for r in published if r.status == "resolved")
    # Community contributions: cases the user helped on, and spam flags of theirs that stuck.
    n_helped = int(db.scalar(select(func.count()).where(Report.helper_id == user.id)) or 0)
    n_mod = int(
        db.scalar(select(func.count()).where(PointEvent.user_id == user.id, PointEvent.reason == "moderation_help"))
        or 0
    )

    earned = set()
    if n_published >= 1:
        earned.add("first_report")
    if n_published >= 10:
        earned.add("reporter_10")
    if n_published >= 50:
        earned.add("reporter_50")
    if distinct_wards >= 5:
        earned.add("ward_explorer")
    if user.reputation >= 80:
        earned.add("verified_reporter")
    if user.reputation >= 95:
        earned.add("pillar_of_trust")
    if n_resolved >= 3:
        earned.add("helper")
    if n_helped >= 10:
        earned.add("top_helper")
    if n_mod >= 5:
        earned.add("community_guardian")
    if reporting_streak(db, user) >= 7:
        earned.add("on_a_roll")

    if not earned:
        return []
    already = {
        b.code
        for b in db.execute(
            select(Badge.code)
            .join(UserBadge, UserBadge.badge_id == Badge.id)
            .where(UserBadge.user_id == user.id)
        ).all()
    }
    to_award = earned - already
    if not to_award:
        return []
    badge_by_code = {b.code: b for b in db.scalars(select(Badge)).all()}
    for code in to_award:
        db.add(UserBadge(user_id=user.id, badge_id=badge_by_code[code].id))
    db.flush()
    return sorted(to_award)
