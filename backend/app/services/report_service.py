"""Report submission orchestration.

The AI rule (docs spec §3): never block submission on an AI call. Species comes from the in-house
ONNX model; injury / edge-case species / content-safety come from Gemini. Every AI step degrades
gracefully when the model or API key is unavailable. Points & full anti-spam land in Phase 5.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import HTTPException, status
from geoalchemy2.elements import WKTElement
from geoalchemy2.shape import to_shape
from sqlalchemy.orm import Session

from app.core.config import settings
from app.ml.gemini import get_gemini
from app.ml.species import get_classifier
from app.models.report import Report
from app.models.user import User
from app.schemas.report import GeneralisedLocation, ReportPublic
from app.services import antispam, gamification
from app.utils.geo import generalise_location, resolve_ward
from app.utils.images import to_ai_jpeg, InvalidImageError, process_upload, to_jpeg_bytes


def create_report(
    db: Session,
    reporter: User,
    raw_bytes: bytes,
    lat: float,
    lng: float,
    species_user_label: str | None = None,
    note: str | None = None,
    injured_user: bool | None = None,
    extra_raws: list[bytes] | None = None,
) -> tuple[Report, str | None]:
    """Create a report. The FIRST image (raw_bytes) is the main one and the only one the AI
    analyses; `extra_raws` are additional photos shown in the feed gallery. Returns (report,
    ai_notice) where ai_notice surfaces a degraded AI step instead of failing silently."""
    try:
        image_path, phash, img = process_upload(raw_bytes, settings.upload_path)
    except InvalidImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    # Bounded copy for the hosted model only; the in-house classifier reads the full image.
    clean_bytes = to_ai_jpeg(img)
    # Host the EXIF-stripped image on Cloudinary when configured; else keep the local path.
    # A downscaled/compressed copy uploads far faster than a multi-MB phone photo.
    from app.services import media
    from app.utils.images import load_clean_image, save_image, to_web_jpeg

    cloud_url = media.upload_image(to_web_jpeg(img), folder="safetails/reports")
    if cloud_url:
        image_path = cloud_url

    # Additional photos (up to 5): EXIF-stripped + hosted, but NOT AI-analysed. Bad files skipped.
    extra_urls: list[str] = []
    for extra in (extra_raws or [])[:5]:
        try:
            eimg = load_clean_image(extra)
        except InvalidImageError:
            continue
        url = media.upload_image(to_web_jpeg(eimg), folder="safetails/reports")
        if not url:
            local = save_image(eimg, settings.upload_path)
            url = f"/uploads/{os.path.basename(local)}"
        extra_urls.append(url)

    gemini = get_gemini()

    # Reuse the pre-submit assessment (POST /reports/assess) for the identical upload when it's
    # still cached: this is the common path and skips 2-3 redundant Gemini calls, so submit
    # returns fast. On a miss (direct submit, cache expiry) we compute everything below.
    from app.ml import assessment_cache

    cached = assessment_cache.get(raw_bytes)
    ai_notice = None

    if cached is not None:
        species_label = cached["species"]["label"]
        species_confidence = cached["species"]["confidence"]
        species_source = cached["species"]["source"]
        species_all_probs = cached["species"].get("all_class_probs") or None
        injury = cached["injury"]
    else:
        # 1. Content-safety pre-filter (Gemini). Unavailable -> allow (never block on AI).
        safety = gemini.content_safety(clean_bytes)
        if not safety.get("allowed", True):
            if os.path.exists(image_path):
                os.remove(image_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Image rejected by content safety: {safety.get('reason', '')}",
            )
        # 2. Species - in-house CNN; Gemini second opinion when Unverified.
        pred = get_classifier().predict(img)
        species_label = pred.label
        species_confidence = pred.confidence
        species_source = "cnn"
        # The model's full distribution at inference (persisted verbatim so the detail view later
        # shows the identical breakdown, never a re-synthesised one).
        species_all_probs = pred.all_class_probs or None
        # A second opinion is worth asking for in two cases: the classifier declined to answer,
        # and the classifier answered without enough confidence to be trusted on its own. The
        # second case matters because a confidently wrong label is published as fact, whereas an
        # uncertain one is at least visibly uncertain.
        needs_second_opinion = species_label == "Unverified" or (
            species_confidence is not None
            and species_confidence < settings.species_trust_threshold
        )
        if needs_second_opinion and gemini.available:
            second = gemini.species_second_opinion(clean_bytes)
            label = (second or {}).get("label")
            if label:
                second_conf = second.get("confidence")
                # Defer to the classifier only when it declined outright; otherwise take the
                # second opinion, which is the more reliable of the two inside this band.
                if species_label == "Unverified" or second_conf is None or second_conf >= 0.5:
                    species_label = label
                    species_confidence = second_conf
                    species_source = "gemini"
        # 3. Injury (Gemini), anchored to the classified species so text can't contradict it.
        injury = gemini.assess_injury(clean_bytes, species=species_label)

    # ORIGINAL AI injury - captured once, stored immutably, never overwritten by a human review.
    ai_injury_status = injury["status"]
    ai_injury_confidence = injury.get("confidence")
    ai_injury_rationale = injury.get("rationale")
    if injury.get("error"):
        ai_notice = f"Injury analysis unavailable ({injury['error']})"

    # EFFECTIVE injury starts from the AI, then applies the human-in-the-loop override: if the
    # reporter marked it injured, trust that even if the AI said otherwise or was unavailable
    # (a missed injury is worse than a false positive). The AI's original stays intact above.
    injury_status = ai_injury_status
    injury_confidence = ai_injury_confidence
    injury_rationale = ai_injury_rationale
    injury_user_override = False
    if injured_user and injury_status != "injured":
        injury_status = "injured"
        injury_confidence = None
        injury_rationale = "Marked as injured by the reporter."
        injury_user_override = True

    # 4. Privacy: generalise location + resolve ward.
    glat, glng = generalise_location(lat, lng, settings.location_grid_meters)
    ward = resolve_ward(glat, glng)

    # 5. Multi-factor, reputation-weighted anti-spam (transparent per-signal breakdown).
    note_clean = note.strip() if note and note.strip() else None
    spam = antispam.evaluate(db, reporter, phash, glat, glng, note=note_clean)
    age_hours = (datetime.now(timezone.utc) - reporter.created_at).total_seconds() / 3600
    moderation_state, mod_reasons = antispam.decide_moderation(
        reporter.reputation, age_hours, spam.spam_score, spam.is_duplicate, spam.over_rate_limit
    )
    # Emergency fast-track: injured/distress cases are published immediately (no waiting for
    # peer confirmation) so help can reach them faster. They can still be flagged/rejected later.
    is_injured = injury_status == "injured"
    if is_injured and moderation_state == "pending_confirmation":
        moderation_state = "published"
        mod_reasons = (mod_reasons or []) + ["published: emergency (injured) fast-track"]

    report = Report(
        reporter_id=reporter.id,
        image_path=image_path,
        extra_images=extra_urls or None,
        image_phash=phash,
        geom=WKTElement(f"POINT({glng} {glat})", srid=4326),
        ward=ward,
        species_label=species_label,
        species_confidence=species_confidence,
        species_source=species_source,
        species_all_probs=species_all_probs,
        species_user_override=species_user_label,
        injury_status=injury_status,
        injury_confidence=injury_confidence,
        injury_rationale=injury_rationale,
        ai_injury_status=ai_injury_status,
        ai_injury_confidence=ai_injury_confidence,
        ai_injury_rationale=ai_injury_rationale,
        injury_user_override=injury_user_override,
        spam_score=spam.spam_score,
        # Transparent record: human-readable reasons, the moderation decision, and the full
        # per-signal breakdown (drives the moderation-transparency UI + thesis explainability).
        spam_reasons={
            "reasons": spam.reasons,
            "decision": mod_reasons,
            "components": spam.components,
        },
        moderation_state=moderation_state,
        status="active",
        note=note_clean,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # 6. Points & reputation only when the report publishes immediately (Phase 5 workflow).
    #    Held reports earn points later, on peer confirmation (see confirm_report).
    if moderation_state == "published":
        gamification.award_points(
            db, reporter, "injury_report" if is_injured else "valid_report", report_id=report.id
        )
        if species_user_label and species_label not in ("Unverified",) and species_user_label == species_label:
            gamification.award_points(db, reporter, "ai_agreement", report_id=report.id)
        gamification.recompute_reputation(db, reporter)
        gamification.check_and_award_badges(db, reporter)
        db.commit()
        db.refresh(report)

    return report, ai_notice


def to_public(report: Report, ai_notice: str | None = None, include_moderation: bool = False) -> ReportPublic:
    """Serialise a Report to its public shape, extracting generalised lat/lng from PostGIS geom.

    `include_moderation` attaches the transparent anti-spam breakdown - pass it only for the
    report owner or a moderator (never on the public feed)."""
    point = to_shape(report.geom)
    # Legacy rows stored spam_reasons as a bare list; normalise to the structured shape.
    mod = report.spam_reasons
    if isinstance(mod, list):
        mod = {"reasons": mod, "decision": [], "components": {}}
    reporter = report.reporter
    reporter_name = None
    reporter_reputation = None
    reporter_avatar_url = None
    if reporter is not None:
        reporter_name = reporter.display_name or reporter.username
        reporter_reputation = reporter.reputation
        reporter_avatar_url = reporter.avatar_url
    return ReportPublic(
        id=report.id,
        reporter_id=report.reporter_id,
        reporter_name=reporter_name,
        reporter_reputation=reporter_reputation,
        reporter_avatar_url=reporter_avatar_url,
        image_path=report.image_path,
        extra_images=report.extra_images or [],
        location=GeneralisedLocation(lat=point.y, lng=point.x, ward=report.ward),
        species_label=report.species_label,
        species_confidence=report.species_confidence,
        species_source=report.species_source,
        species_all_probs=report.species_all_probs or None,
        species_user_override=report.species_user_override,
        injury_status=report.injury_status,
        injury_confidence=report.injury_confidence,
        injury_rationale=report.injury_rationale,
        ai_injury_status=report.ai_injury_status,
        ai_injury_confidence=report.ai_injury_confidence,
        ai_injury_rationale=report.ai_injury_rationale,
        injury_user_override=bool(report.injury_user_override),
        note=report.note,
        status=report.status,
        moderation_state=report.moderation_state,
        spam_score=report.spam_score,
        moderation=(mod if include_moderation else None),
        created_at=report.created_at,
        ai_notice=ai_notice,
    )
