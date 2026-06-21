"""Geo-spatial map endpoints (PostGIS-backed). Only published reports are exposed."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services import map_service

router = APIRouter()


@router.get("/markers")
def markers(
    bbox: str | None = Query(None, description="minLng,minLat,maxLng,maxLat"),
    species: str | None = None,
    injured: bool | None = None,
    ward: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """GeoJSON FeatureCollection of generalised report points (clusterable on the client)."""
    try:
        return map_service.markers(
            db, bbox=bbox, species=species, injured=injured, ward=ward, since=since, until=until
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/heatmap")
def heatmap(
    bbox: str | None = None, since: datetime | None = None, db: Session = Depends(get_db)
) -> list[dict]:
    try:
        return map_service.heatmap(db, since=since, bbox=bbox)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/wards")
def wards(db: Session = Depends(get_db)) -> dict:
    """Ward polygons (GeoJSON, if available) + per-ward report counts."""
    return map_service.wards(db)


@router.get("/hotspot/summary")
def hotspot_summary(
    ward: str | None = None, bbox: str | None = None, db: Session = Depends(get_db)
) -> dict:
    """Aggregated stats + Gemini natural-language summary (AI-marked; null if unavailable)."""
    try:
        return map_service.hotspot_summary(db, ward=ward, bbox=bbox)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
