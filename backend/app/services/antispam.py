"""Multi-factor, reputation-weighted anti-spam (core thesis contribution).

Rather than a single technique, spam is scored from several *independent* behavioural signals,
each producing a transparent 0..1 sub-score. They are combined into one `spam_score` via a
weighted sum, on top of hard deterministic guards. This makes the decision explainable (every
report carries a per-signal breakdown) and hard to game (evading one signal still trips others).

Signals (docs/GAMIFICATION.md §4-6):
  1. duplicate_image     - perceptual-hash near-duplicate submitted nearby recently (hard guard)
  2. text_similarity     - note is a near-duplicate of the reporter's own recent notes
  3. burst_frequency     - reporting velocity over 1h / 24h vs soft limits
  4. location_repetition - reports clustered in a single generalised cell (low location entropy)
  5. reputation_deficit  - how far below the publish bar the reporter's reputation sits
  6. historical_accuracy - the reporter's past flag/rejection rate
  7. community_flags     - reputation-weighted spam flags on the reporter's recent reports
  8. ai_content          - Gemini spam/abuse judgment from a PII-free behavioural summary

Layer 3 is the pure reputation-weighted moderation decision (`decide_moderation`): publish now,
hold for peer confirmation, or (for the worst signals) hold regardless of reputation.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import imagehash
from geoalchemy2 import functions as geofunc
from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ml.gemini import get_gemini
from app.models.report import Report, ReportConfirmation
from app.models.user import User
from app.services.gamification import gather_reputation_inputs

# --- Tunables (docs/GAMIFICATION.md) ---------------------------------------
RATE_LIMIT_24H = 10        # hard cap: points-earning reports per user per 24h
BURST_LIMIT_1H = 5         # soft cap used by the burst-frequency signal
PHASH_MAX_DISTANCE = 5     # Hamming distance for "same image"
DUP_RADIUS_DEG = 200 / 111_320.0  # ~200 m in degrees (4326)
TEXT_SIM_THRESHOLD = 0.6   # token-Jaccard above this = "same note reused"
# Default new-user reputation is 50; keep the bar at/below that so honest reporting publishes
# immediately and stays usable. Reports are only HELD when an actual spam signal fires or the
# reputation is genuinely low.
REP_PUBLISH_THRESHOLD = 45
SPAM_HOLD_THRESHOLD = 0.7
NEW_ACCOUNT_HOURS = 24
# Verification-first: clean reports still enter peer confirmation unless the reporter is highly
# trusted (reputation-weighted fast-track). New users (reputation ~50) are held until confirmed.
REP_TRUSTED_THRESHOLD = 75

# Weighted blend of the soft signals -> combined spam_score (hard guards override upward).
SIGNAL_WEIGHTS: dict[str, float] = {
    "duplicate_image": 0.22,
    "text_similarity": 0.12,
    "burst_frequency": 0.14,
    "location_repetition": 0.08,
    "reputation_deficit": 0.10,
    "historical_accuracy": 0.12,
    "community_flags": 0.10,
    "ai_content": 0.12,
}

# Human-readable reason per signal when it fires (score >= 0.5).
_SIGNAL_REASON = {
    "duplicate_image": "Near-duplicate image submitted recently nearby",
    "text_similarity": "Report note closely repeats your recent submissions",
    "burst_frequency": "Unusually high reporting frequency",
    "location_repetition": "Many reports from the same small area",
    "reputation_deficit": "Reporter reputation below the publish bar",
    "historical_accuracy": "History of flagged/rejected reports",
    "community_flags": "Recent reports flagged by trusted community members",
    "ai_content": "AI content analysis flagged this as likely spam",
}

_WORD = re.compile(r"[a-z0-9]+")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


# --- Individual signals -----------------------------------------------------
def recent_report_count(db: Session, user_id, hours: int = 24, only_published: bool = False) -> int:
    cutoff = _utcnow() - timedelta(hours=hours)
    stmt = select(func.count()).where(Report.reporter_id == user_id, Report.created_at >= cutoff)
    if only_published:
        stmt = stmt.where(Report.moderation_state == "published")
    return int(db.scalar(stmt) or 0)


def find_duplicate(db: Session, user_id, phash: str, glat: float, glng: float, hours: int = 24) -> bool:
    """True if the user posted a near-identical image nearby within the window (dedup guard)."""
    if not phash:
        return False
    cutoff = _utcnow() - timedelta(hours=hours)
    point = WKTElement(f"POINT({glng} {glat})", srid=4326)
    rows = db.execute(
        select(Report.image_phash).where(
            Report.reporter_id == user_id,
            Report.created_at >= cutoff,
            Report.image_phash.is_not(None),
            geofunc.ST_DWithin(Report.geom, point, DUP_RADIUS_DEG),
        )
    ).all()
    new_h = imagehash.hex_to_hash(phash)
    for (ph,) in rows:
        try:
            if (new_h - imagehash.hex_to_hash(ph)) <= PHASH_MAX_DISTANCE:
                return True
        except ValueError:
            continue
    return False


def _tokens(text: str | None) -> set[str]:
    return set(_WORD.findall((text or "").lower()))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def max_text_similarity(db: Session, user_id, note: str | None, hours: int = 72) -> float:
    """Max token-Jaccard between this note and the reporter's recent notes (0..1)."""
    toks = _tokens(note)
    if len(toks) < 3:  # too short to judge as a duplicate
        return 0.0
    cutoff = _utcnow() - timedelta(hours=hours)
    rows = db.execute(
        select(Report.note).where(
            Report.reporter_id == user_id,
            Report.created_at >= cutoff,
            Report.note.is_not(None),
        )
    ).all()
    return max((_jaccard(toks, _tokens(n)) for (n,) in rows), default=0.0)


def _location_entropy(db: Session, user_id) -> float:
    """Distinct generalised cells / total reports (0..1). Low -> repetitive single spot."""
    rows = db.execute(
        select(geofunc.ST_AsText(Report.geom)).where(Report.reporter_id == user_id)
    ).all()
    if not rows:
        return 1.0
    distinct = len({r[0] for r in rows})
    return round(distinct / len(rows), 3)


def community_flag_pressure(db: Session, user_id, hours: int = 168) -> tuple[float, float]:
    """Reputation-weighted spam/invalid flags on the reporter's recent reports.

    Each flag counts as (flagger.reputation / 50), so a trusted user's flag weighs more than a
    brand-new account's. Returns (raw_weighted_sum, signal_score in 0..1)."""
    cutoff = _utcnow() - timedelta(hours=hours)
    rows = db.execute(
        select(func.coalesce(func.sum(User.reputation / 50.0), 0.0))
        .select_from(ReportConfirmation)
        .join(Report, Report.id == ReportConfirmation.report_id)
        .join(User, User.id == ReportConfirmation.user_id)
        .where(
            Report.reporter_id == user_id,
            ReportConfirmation.vote != "confirm",
            ReportConfirmation.created_at >= cutoff,
        )
    ).scalar()
    weighted = float(rows or 0.0)
    # 2 trusted flags (~weight 2) already saturates the signal.
    return weighted, _clamp01(weighted / 2.0)


@dataclass
class SpamEvaluation:
    spam_score: float
    reasons: list[str] = field(default_factory=list)
    components: dict[str, float] = field(default_factory=dict)  # per-signal 0..1 sub-scores
    is_duplicate: bool = False
    over_rate_limit: bool = False
    gemini_available: bool = False


def build_behaviour_summary(db: Session, user, is_duplicate: bool, text_sim: float) -> dict:
    """PII-FREE behavioural summary for Gemini (no ids, emails, or exact coordinates)."""
    inp = gather_reputation_inputs(db, user)
    last24 = recent_report_count(db, user.id, 24)
    age_days = max((_utcnow() - user.created_at).days, 0)
    return {
        "account_age_days": age_days,
        "reports_last_24h": last24,
        "phash_repetition_rate": round(1.0 if is_duplicate else 0.0, 3),
        "text_repetition_rate": round(text_sim, 3),
        "ai_agreement_rate": round(inp.agreed / inp.labelled, 3) if inp.labelled else 0.5,
        "location_entropy": _location_entropy(db, user.id),
        "flag_rate": round(inp.flagged / inp.total, 3) if inp.total else 0.0,
        "reputation": round(user.reputation, 1),
        "prior_spam_strikes": int(getattr(user, "spam_strikes", 0) or 0),
    }


def evaluate(db: Session, user, phash: str, glat: float, glng: float, note: str | None = None) -> SpamEvaluation:
    """Score a submission across all signals and combine into one transparent spam_score."""
    # --- deterministic / DB signals ---
    is_dup = find_duplicate(db, user.id, phash, glat, glng)
    n_24h = recent_report_count(db, user.id, 24, only_published=True)
    n_1h = recent_report_count(db, user.id, 1)
    over_rate = n_24h >= RATE_LIMIT_24H
    text_sim = max_text_similarity(db, user.id, note)
    entropy = _location_entropy(db, user.id)
    _, flag_score = community_flag_pressure(db, user.id)
    inp = gather_reputation_inputs(db, user)

    components: dict[str, float] = {
        "duplicate_image": 1.0 if is_dup else 0.0,
        "text_similarity": _clamp01((text_sim - TEXT_SIM_THRESHOLD) / (1 - TEXT_SIM_THRESHOLD)) if text_sim > TEXT_SIM_THRESHOLD else 0.0,
        "burst_frequency": _clamp01(max(n_1h / BURST_LIMIT_1H, n_24h / RATE_LIMIT_24H) - 0.2),
        "location_repetition": _clamp01((0.5 - entropy) / 0.5) if inp.total >= 4 else 0.0,
        "reputation_deficit": _clamp01((REP_PUBLISH_THRESHOLD - user.reputation) / REP_PUBLISH_THRESHOLD),
        "historical_accuracy": _clamp01((inp.flagged / inp.total) * 2.0) if inp.total else 0.0,
        "community_flags": flag_score,
        "ai_content": 0.0,  # filled in below only when worth spending a Gemini call
    }

    # Only spend a Gemini spam-judgment call when the cheap signals are already ambiguous:
    # a duplicate/rate/text signal, low reputation, or an accumulating soft score. Trusted, clean
    # reports skip the AI round-trip so submission stays fast and quota is reserved for the
    # genuinely borderline cases.
    soft_pre = sum(SIGNAL_WEIGHTS[k] * v for k, v in components.items() if k != "ai_content")
    needs_ai = is_dup or over_rate or user.reputation < REP_PUBLISH_THRESHOLD or text_sim > TEXT_SIM_THRESHOLD or soft_pre > 0.15
    gem = {"reasons": [], "spam_score": 0.0, "available": False}
    if needs_ai:
        gem = get_gemini().judge_spam(build_behaviour_summary(db, user, is_dup, text_sim))
        components["ai_content"] = _clamp01(float(gem.get("spam_score", 0.0)))

    # --- weighted blend of the soft signals ---
    score = sum(SIGNAL_WEIGHTS[k] * v for k, v in components.items())
    # Hard guards override upward (a duplicate or an over-limit burst is spam regardless of blend).
    if is_dup:
        score = max(score, 0.8)
    if over_rate:
        score = max(score, 0.7)

    reasons: list[str] = list(gem.get("reasons", []))
    for k, v in components.items():
        if v >= 0.5 and _SIGNAL_REASON.get(k) and _SIGNAL_REASON[k] not in reasons:
            reasons.append(_SIGNAL_REASON[k])
    if over_rate:
        reasons.append(f"Submission rate exceeds {RATE_LIMIT_24H}/24h")

    return SpamEvaluation(
        spam_score=round(_clamp01(score), 3),
        reasons=reasons,
        components={k: round(v, 3) for k, v in components.items()},
        is_duplicate=is_dup,
        over_rate_limit=over_rate,
        gemini_available=bool(gem.get("available")),
    )


def decide_moderation(
    reputation: float,
    account_age_hours: float,
    spam_score: float,
    is_duplicate: bool,
    over_rate_limit: bool,
) -> tuple[str, list[str]]:
    """Pure reputation-weighted moderation decision -> (moderation_state, reasons)."""
    reasons: list[str] = []
    if is_duplicate:
        reasons.append("held: duplicate image")
    if over_rate_limit:
        reasons.append("held: rate limit exceeded")
    if spam_score >= SPAM_HOLD_THRESHOLD:
        reasons.append(f"held: spam score {spam_score:.2f} >= {SPAM_HOLD_THRESHOLD}")
    if reputation < REP_PUBLISH_THRESHOLD:
        reasons.append(f"held: reputation {reputation:.0f} < {REP_PUBLISH_THRESHOLD}")
    # A brand-new account is only held when it ALSO shows a spam signal or low reputation
    # (handled above) - account age alone no longer blocks honest first reports.
    if account_age_hours < NEW_ACCOUNT_HOURS and (spam_score >= SPAM_HOLD_THRESHOLD or is_duplicate):
        reasons.append("held: new account with a spam signal")

    # Hard spam signals above always hold the report.
    if reasons:
        return ("pending_confirmation", reasons)

    # Verification-first: even clean reports enter peer confirmation, EXCEPT from highly-trusted
    # reporters who have earned a reputation-weighted fast-track. This is the core moderation
    # contribution: trust is earned, and the community validates everyone else's sightings.
    if reputation >= REP_TRUSTED_THRESHOLD:
        return ("published", [f"published: trusted reporter (reputation {reputation:.0f} >= {REP_TRUSTED_THRESHOLD})"])
    return ("pending_confirmation", ["held: awaiting community confirmation"])
