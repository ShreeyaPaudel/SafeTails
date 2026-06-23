"""Report endpoints: submission (+ AI labelling), detail, and filtered listing."""
from __future__ import annotations

import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from geoalchemy2 import functions as geofunc
from sqlalchemy import delete as sql_delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, get_current_user_optional
from app.core.config import settings
from app.core.database import get_db
from app.models.report import PointEvent, Report
from app.models.social import Comment, Like
from app.models.user import User
from app.schemas.gamification import ConfirmationResult
from app.schemas.report import ConfirmationCreate, ReportPublic, ReportUpdate
from app.ml.species import get_classifier
from app.utils.images import to_ai_jpeg
from app.services import gamification
from app.services.confirmation_service import confirm_report as confirm_report_service
from app.services.report_service import create_report, to_public

router = APIRouter()

_MAX_BYTES = lambda: settings.max_upload_mb * 1024 * 1024  # noqa: E731


@router.post("", response_model=ReportPublic, status_code=201)
async def submit_report(
    image: UploadFile = File(...),
    extra_images: list[UploadFile] = File(default=[]),  # additional photos (not AI-analysed)
    lat: float = Form(..., ge=-90, le=90),
    lng: float = Form(..., ge=-180, le=180),
    species_user_label: str | None = Form(None),
    note: str | None = Form(None),
    injured: bool | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReportPublic:
    # Trust-and-safety: a reporter under an active posting cooldown (repeat confirmed-spam
    # offender) cannot submit until it expires.
    if user.suspended_until is not None:
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        until = user.suspended_until
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        if until > now:
            mins = int((until - now).total_seconds() // 60) + 1
            raise HTTPException(
                status_code=403,
                detail=f"Posting is temporarily restricted after repeated spam reports. Try again in ~{mins} min.",
            )
    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload")
    if len(raw) > _MAX_BYTES():
        raise HTTPException(status_code=413, detail=f"Image exceeds {settings.max_upload_mb} MB")
    extra_raws: list[bytes] = []
    for f in (extra_images or [])[:5]:
        b = await f.read()
        if b and len(b) <= _MAX_BYTES():
            extra_raws.append(b)
    report, ai_notice = create_report(
        db, user, raw, lat, lng, species_user_label, note, injured_user=injured, extra_raws=extra_raws
    )
    return to_public(report, ai_notice)


def _read_image(raw: bytes):
    import io

    from PIL import Image, UnidentifiedImageError

    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload")
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
        return img.convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Invalid image")


@router.post("/classify")
async def classify(image: UploadFile = File(...), user: User = Depends(get_current_user)) -> dict:
    """Run ONLY the in-house species CNN (no Gemini) so the submit review shows the real prediction."""
    pred = get_classifier().predict(_read_image(await image.read()))
    return {
        "label": pred.label, "confidence": pred.confidence,
        "all_class_probs": pred.all_class_probs, "source": pred.source,
        "model_available": pred.model_available,
    }


@router.post("/assess")
async def assess(image: UploadFile = File(...), user: User = Depends(get_current_user)) -> dict:
    """Full pre-submit review: in-house CNN species + AI injury assessment, with explicit error
    reasons so the UI can show a clear toast instead of failing silently. No DB write.

    The result is cached by image content so the subsequent POST /reports on the same photo
    reuses it instead of re-running the AI (the main submit-latency win)."""
    import io

    from app.ml import assessment_cache
    from app.ml.gemini import get_gemini

    raw = await image.read()
    img = _read_image(raw)
    pred = get_classifier().predict(img)
    jpeg = to_ai_jpeg(img)  # bounded payload: full-res uploads time out
    # Injury rationale is anchored to the CNN species so the two never contradict.
    injury = get_gemini().assess_injury(jpeg, species=pred.label)
    species = {
        "label": pred.label, "confidence": pred.confidence,
        "all_class_probs": pred.all_class_probs, "source": pred.source,
        "model_available": pred.model_available,
    }
    # Cache keyed by the ORIGINAL upload bytes: the browser submits the identical file to
    # POST /reports moments later, so this is a guaranteed hit that skips re-running the AI.
    assessment_cache.put(raw, {"species": species, "injury": injury})
    return {"species": species, "injury": injury}


@router.get("", response_model=list[ReportPublic])
def list_reports(
    species: str | None = None,
    injured: bool | None = None,
    ward: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    bbox: str | None = Query(None, description="minLng,minLat,maxLng,maxLat"),
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
) -> list[ReportPublic]:
    stmt = select(Report).options(selectinload(Report.reporter)).where(Report.moderation_state != "rejected")
    if species:
        stmt = stmt.where(Report.species_label == species)
    if injured is not None:
        stmt = stmt.where(Report.injury_status == ("injured" if injured else "not_injured"))
    if ward:
        stmt = stmt.where(Report.ward == ward)
    if since:
        stmt = stmt.where(Report.created_at >= since)
    if until:
        stmt = stmt.where(Report.created_at <= until)
    if bbox:
        try:
            min_lng, min_lat, max_lng, max_lat = (float(v) for v in bbox.split(","))
        except ValueError:
            raise HTTPException(status_code=400, detail="bbox must be 'minLng,minLat,maxLng,maxLat'")
        envelope = geofunc.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
        stmt = stmt.where(geofunc.ST_Within(Report.geom, envelope))
    stmt = stmt.order_by(Report.created_at.desc()).limit(limit).offset(offset)
    return [to_public(r) for r in db.scalars(stmt).all()]


@router.get("/mine", response_model=list[ReportPublic])
def my_reports(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ReportPublic]:
    """Every report the current user has submitted, in ALL moderation states (published, held for
    verification, rejected). Owner-only, so the transparent moderation breakdown is attached."""
    reports = db.scalars(
        select(Report)
        .options(selectinload(Report.reporter))
        .where(Report.reporter_id == user.id)
        .order_by(Report.created_at.desc())
    ).all()
    return [to_public(r, include_moderation=True) for r in reports]


@router.get("/saved", response_model=list[ReportPublic])
def saved_reports(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ReportPublic]:
    """Reports the current user has bookmarked, newest-saved first."""
    from app.models.social import SavedReport

    reports = db.scalars(
        select(Report)
        .join(SavedReport, SavedReport.report_id == Report.id)
        .options(selectinload(Report.reporter))
        .where(SavedReport.user_id == user.id)
        .order_by(SavedReport.created_at.desc())
    ).all()
    return [to_public(r) for r in reports]


@router.post("/{report_id}/save")
def save_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    from app.models.social import SavedReport

    if db.get(Report, report_id) is None:
        raise HTTPException(status_code=404, detail="Report not found")
    existing = db.scalar(
        select(SavedReport).where(SavedReport.report_id == report_id, SavedReport.user_id == user.id)
    )
    if existing is None:
        db.add(SavedReport(report_id=report_id, user_id=user.id))
        db.commit()
    return {"saved": True}


@router.delete("/{report_id}/save")
def unsave_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    from app.models.social import SavedReport

    existing = db.scalar(
        select(SavedReport).where(SavedReport.report_id == report_id, SavedReport.user_id == user.id)
    )
    if existing is not None:
        db.delete(existing)
        db.commit()
    return {"saved": False}


@router.get("/helped", response_model=list[ReportPublic])
def helped_reports(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ReportPublic]:
    """Reports where the current user contributed help - either recorded as the helper or having
    offered help that the reporter accepted (their community-contribution history)."""
    from app.models.report import HelpRequest

    ids = set(
        db.scalars(select(Report.id).where(Report.helper_id == user.id)).all()
    ) | set(
        db.scalars(
            select(HelpRequest.report_id).where(
                HelpRequest.helper_id == user.id, HelpRequest.status == "accepted"
            )
        ).all()
    )
    if not ids:
        return []
    reports = db.scalars(
        select(Report)
        .options(selectinload(Report.reporter))
        .where(Report.id.in_(ids))
        .order_by(Report.created_at.desc())
    ).all()
    return [to_public(r) for r in reports]


@router.get("/{report_id}", response_model=ReportPublic)
def get_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
) -> ReportPublic:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    # Owner (or moderator) sees the moderation breakdown; the public does not.
    is_owner = user is not None and (report.reporter_id == user.id or user.role in ("moderator", "admin"))
    return to_public(report, include_moderation=is_owner)


@router.patch("/{report_id}", response_model=ReportPublic)
def update_report(
    report_id: uuid.UUID,
    payload: ReportUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReportPublic:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.reporter_id != user.id and report.helper_id != user.id and user.role not in ("moderator", "admin"):
        raise HTTPException(status_code=403, detail="Not allowed to edit this report")
    if payload.status is not None:
        if payload.status not in ("active", "being_helped", "resolved"):
            raise HTTPException(status_code=400, detail="Invalid status")
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        newly_resolved = payload.status == "resolved" and report.status != "resolved"
        # Response-time analytics: stamp the lifecycle transitions the first time they happen.
        if payload.status == "being_helped" and report.first_helped_at is None:
            report.first_helped_at = now
        if newly_resolved:
            report.resolved_at = now
            if report.first_helped_at is None:
                report.first_helped_at = now
        report.status = payload.status
        if newly_resolved:
            # Reward the reporter for a case reaching resolution; reward the helper if different.
            reporter = db.get(User, report.reporter_id)
            if reporter:
                gamification.award_points(db, reporter, "resolved", report_id=report.id)
                gamification.recompute_reputation(db, reporter)
                gamification.check_and_award_badges(db, reporter)
            if user.id != report.reporter_id:
                gamification.award_points(db, user, "helped", report_id=report.id)
                if report.injury_status == "injured":
                    gamification.award_badge(db, user, "first_responder")
    if payload.species_user_override is not None:
        report.species_user_override = payload.species_user_override
    db.commit()
    db.refresh(report)
    return to_public(report)


@router.delete("/{report_id}", status_code=204)
def delete_report(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.reporter_id != user.id and user.role not in ("moderator", "admin"):
        raise HTTPException(status_code=403, detail="Not allowed to delete this report")
    # Remove dependent rows first (comments/likes/point-events have no DB cascade; confirmations
    # cascade via the ORM relationship when the report is deleted).
    db.execute(sql_delete(Comment).where(Comment.report_id == report_id))
    db.execute(sql_delete(Like).where(Like.report_id == report_id))
    db.execute(sql_delete(PointEvent).where(PointEvent.report_id == report_id))
    img = report.image_path
    db.delete(report)
    db.commit()
    if img:
        try:
            if os.path.exists(img):
                os.remove(img)
        except OSError:
            pass
    return None


@router.post("/{report_id}/ai-feedback")
def ai_feedback(
    report_id: uuid.UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Record 'was this AI result right?' feedback (responsible-AI transparency + live quality
    signal). target = species | injury; agree = true/false. Idempotent per user/report/target."""
    from app.models.report import AIFeedback

    target = payload.get("target")
    agree = payload.get("agree")
    if target not in ("species", "injury") or not isinstance(agree, bool):
        raise HTTPException(status_code=400, detail="target must be 'species' or 'injury' and agree must be boolean")
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    existing = db.scalar(
        select(AIFeedback).where(
            AIFeedback.report_id == report_id, AIFeedback.user_id == user.id, AIFeedback.target == target
        )
    )
    if existing is not None:
        existing.agree = agree
    else:
        db.add(AIFeedback(report_id=report_id, user_id=user.id, target=target, agree=agree))
    db.commit()
    rows = db.execute(
        select(AIFeedback.agree, func.count()).where(AIFeedback.report_id == report_id, AIFeedback.target == target).group_by(AIFeedback.agree)
    ).all()
    counts = {bool(a): int(c) for a, c in rows}
    return {"target": target, "your_vote": agree, "agree": counts.get(True, 0), "disagree": counts.get(False, 0)}


@router.post("/{report_id}/confirm", response_model=ConfirmationResult)
def confirm_report(
    report_id: uuid.UUID,
    payload: ConfirmationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ConfirmationResult:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    result = confirm_report_service(db, report, user, payload.vote)
    return ConfirmationResult(**result)
