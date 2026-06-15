"""Geo-spatial map queries: markers (GeoJSON), heatmap, ward aggregation, hotspot summary.

Only `published` reports are exposed on the map. Coordinates are already generalised at storage
time (privacy), so nothing further is masked here.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from geoalchemy2 import functions as geofunc
from geoalchemy2.shape import to_shape
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.ml.gemini import get_gemini
from app.models.report import Report


def _published() -> Select:
    return select(Report).where(Report.moderation_state == "published")


def apply_filters(
    stmt: Select,
    species: str | None = None,
    injured: bool | None = None,
    ward: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    bbox: str | None = None,
) -> Select:
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
        except ValueError as exc:
            raise ValueError("bbox must be 'minLng,minLat,maxLng,maxLat'") from exc
        envelope = geofunc.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
        stmt = stmt.where(geofunc.ST_Within(Report.geom, envelope))
    return stmt


def markers(db: Session, **filters) -> dict:
    stmt = apply_filters(_published(), **filters).limit(filters.get("limit", 1000))
    features = []
    for r in db.scalars(stmt).all():
        pt = to_shape(r.geom)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [pt.x, pt.y]},
                "properties": {
                    "id": str(r.id),
                    "species": r.species_label,
                    "species_source": r.species_source,
                    "species_is_ai_estimate": True,
                    "injury_status": r.injury_status,
                    "status": r.status,
                    "moderation_state": r.moderation_state,
                    "ward": r.ward,
                    "created_at": r.created_at.isoformat(),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def heatmap(db: Session, since: datetime | None = None, bbox: str | None = None) -> list[dict]:
    """Density points aggregated by generalised location cell (weight = count)."""
    stmt = apply_filters(
        select(geofunc.ST_Y(Report.geom), geofunc.ST_X(Report.geom), func.count())
        .where(Report.moderation_state == "published"),
        since=since,
        bbox=bbox,
    ).group_by(Report.geom)
    return [{"lat": lat, "lng": lng, "weight": int(c)} for lat, lng, c in db.execute(stmt).all()]


def ward_counts(db: Session) -> dict[str, int]:
    rows = db.execute(
        select(Report.ward, func.count())
        .where(Report.moderation_state == "published", Report.ward.is_not(None))
        .group_by(Report.ward)
    ).all()
    return {ward: int(c) for ward, c in rows}


def wards(db: Session, geojson_path: str = "data/kathmandu_wards.geojson") -> dict:
    """Ward polygons (if a GeoJSON is provided) annotated with report counts."""
    counts = ward_counts(db)
    path = Path(geojson_path)
    features = []
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        for feat in data.get("features", []):
            props = feat.get("properties", {})
            name = props.get("name") or props.get("NAME") or props.get("ward") or "Unknown"
            feat.setdefault("properties", {})["report_count"] = counts.get(str(name), 0)
            features.append(feat)
    return {"type": "FeatureCollection", "features": features, "ward_counts": counts}


def hotspot_summary(db: Session, ward: str | None = None, bbox: str | None = None) -> dict:
    stmt = apply_filters(_published(), ward=ward, bbox=bbox)
    reports = db.scalars(stmt).all()
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    by_species: dict[str, int] = {}
    for r in reports:
        by_species[r.species_label] = by_species.get(r.species_label, 0) + 1
    stats = {
        "area": ward or "selected area",
        "total": len(reports),
        "by_species": by_species,
        "injured_count": sum(1 for r in reports if r.injury_status == "injured"),
        "last_7_days": sum(1 for r in reports if r.created_at >= week_ago),
    }
    narrative = get_gemini().narrate(
        "Summarise what animal sightings are happening in this Kathmandu area for a community map "
        "tooltip. Be factual and brief.",
        stats,
    )
    return {
        "stats": stats,
        "ai_summary": narrative,
        "is_ai_generated": narrative is not None,
    }
