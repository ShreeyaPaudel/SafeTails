"""Geo helpers: privacy-preserving location generalisation + area (ward) resolution.

Privacy (docs/ETHICS.md): we never store the exact GPS. The point is generalised to a ~100 m
grid before storage/display.

Area resolution returns a name from the SAME canonical list the client offers in its area
filter (data/kathmandu_areas.json). If the two ever disagreed, a report would be stored under
a name no filter can select, which is silent data loss from the user's point of view.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from app.core.config import BASE_DIR

_METERS_PER_DEG_LAT = 111_320.0

# A point further than this from every known area centroid is outside the served region; we
# return None rather than snapping it onto an unrelated neighbourhood.
_MAX_SNAP_KM = 12.0


def generalise_location(lat: float, lng: float, grid_meters: int = 100) -> tuple[float, float]:
    """Generalise a coordinate to a ~grid_meters grid (privacy generalisation).

    Implemented as fixed-decimal rounding: 3 dp ≈ 111 m latitude / ~98 m longitude in Kathmandu,
    i.e. the ~100 m default grid. This is idempotent and boundary-stable (unlike float grid-snap),
    which matters because the generalised value is what we persist and re-display.
    """
    decimals = max(0, round(math.log10(_METERS_PER_DEG_LAT / grid_meters)))
    return round(lat, decimals), round(lng, decimals)


def _abs_path(p: str) -> Path:
    """Anchor a relative data path to the repo root so resolution is CWD-independent."""
    path = Path(p)
    return path if path.is_absolute() else BASE_DIR / path


@lru_cache(maxsize=1)
def _load_areas(areas_path: str) -> tuple[tuple[str, float, float], ...]:
    """Canonical (name, lng, lat) centroids. Empty tuple if the file is missing."""
    path = _abs_path(areas_path)
    if not path.exists():
        return ()
    data = json.loads(path.read_text(encoding="utf-8"))
    return tuple((str(a["name"]), float(a["lng"]), float(a["lat"])) for a in data if a.get("name"))


@lru_cache(maxsize=1)
def _load_ward_polygons(geojson_path: str) -> tuple[tuple[str, object], ...]:
    """Ward polygons as (name, shapely geometry). Empty if the file or shapely is unavailable."""
    path = _abs_path(geojson_path)
    if not path.exists():
        return ()
    try:
        from shapely.geometry import shape  # imported lazily
    except ImportError:
        return ()
    data = json.loads(path.read_text(encoding="utf-8"))
    out: list[tuple[str, object]] = []
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        name = props.get("name") or props.get("NAME") or props.get("ward") or "Unknown"
        out.append((str(name), shape(feat["geometry"])))
    return tuple(out)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nearest_area(
    lat: float,
    lng: float,
    areas_path: str = "data/kathmandu_areas.json",
    max_km: float = _MAX_SNAP_KM,
) -> str | None:
    """Nearest canonical area by great-circle distance, or None if nothing is within max_km.

    Mirrors the client's own nearest-area behaviour, so the name shown to the reporter at
    submission time is the name the report is stored under and the name the filter selects.
    """
    areas = _load_areas(areas_path)
    if not areas:
        return None
    best_name, best_km = None, float("inf")
    for name, a_lng, a_lat in areas:
        d = _haversine_km(lat, lng, a_lat, a_lng)
        if d < best_km:
            best_name, best_km = name, d
    return best_name if best_km <= max_km else None


def resolve_ward(
    lat: float,
    lng: float,
    geojson_path: str = "data/kathmandu_wards.geojson",
    areas_path: str = "data/kathmandu_areas.json",
) -> str | None:
    """Resolve a coordinate to an area name.

    Prefers true point-in-polygon lookup when ward boundaries are available, and otherwise
    falls back to the nearest canonical area centroid. The fallback matters: without it every
    report submitted through the app is stored with no area at all and disappears from the
    area filter.
    """
    for name, geom in _load_ward_polygons(geojson_path):
        from shapely.geometry import Point

        if geom.contains(Point(lng, lat)):
            return name
    return nearest_area(lat, lng, areas_path)
