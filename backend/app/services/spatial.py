"""Spatial decision-support analytics (advanced thesis feature).

Three complementary, well-established techniques computed over the live report geometry - each a
pure, testable function that takes plain arrays (no DB, no framework), so the maths can be unit
tested and reproduced independently of the API:

  1. `getis_ord_hotspots`  - Getis-Ord Gi* local statistic on a spatial grid. Identifies where
                             incidents cluster *more than chance* (a significance-tested hotspot),
                             not merely where raw counts are high. This is the standard method for
                             statistically-significant hotspot detection in spatial epidemiology.
  2. `dbscan_clusters`     - density-based clustering (DBSCAN) of raw incident points into emergent
                             clusters that ignore administrative ward boundaries, with noise
                             rejection. Surfaces organic incident groupings for resource dispatch.
  3. `ward_anomalies`      - per-ward temporal anomaly detection: a z-score of recent activity
                             against each ward's own trailing baseline, flagging emerging surges.

Reference: Getis & Ord (1992); Ester et al. (1996, DBSCAN).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

# ~metres-per-degree at Kathmandu's latitude (27.7 N); good enough for local-scale distances.
_M_PER_DEG_LAT = 110_574.0
_M_PER_DEG_LNG = 96_486.0  # cos(27.7 deg) * 111,320


def _p_label(z: float) -> str:
    """Two-sided significance label for a Gi* z-score (standard-normal critical values)."""
    az = abs(z)
    if az >= 2.58:
        return "p<0.01"
    if az >= 1.96:
        return "p<0.05"
    if az >= 1.65:
        return "p<0.10"
    return "ns"


def _intensity_label(z: float) -> str:
    """Plain-language strength of a hotspot (for non-technical readers)."""
    if z >= 3.5:
        return "extreme"
    if z >= 2.58:
        return "very high"
    if z >= 1.96:
        return "high"
    if z >= 1.65:
        return "elevated"
    return "typical"


@dataclass
class HotspotCell:
    lat: float
    lng: float
    count: int
    gi_z: float
    significance: str
    kind: str  # "hotspot" | "coldspot" | "ns"
    times_avg: float = 1.0        # local density vs the citywide average (how many "times")
    intensity: str = "typical"    # plain-language strength label


def getis_ord_hotspots(
    lats: np.ndarray, lngs: np.ndarray, cell_deg: float = 0.005, top: int = 12
) -> list[HotspotCell]:
    """Getis-Ord Gi* over a regular grid covering the points' bounding box.

    Each populated study-area cell gets a Gi* z-score using a 3x3 (queen-contiguity, incl. self)
    binary spatial weight. Positive z = statistically-significant hotspot; negative = coldspot.
    Returns the most significant cells (by |z|), hotspots first."""
    if len(lats) < 5:
        return []
    lats = np.asarray(lats, float)
    lngs = np.asarray(lngs, float)
    # Grid index per point.
    lat0, lng0 = lats.min(), lngs.min()
    gi = np.floor((lats - lat0) / cell_deg).astype(int)
    gj = np.floor((lngs - lng0) / cell_deg).astype(int)
    n_rows, n_cols = int(gi.max()) + 1, int(gj.max()) + 1
    if n_rows * n_cols > 40_000:  # guard: coarsen implicitly by capping study area
        return []
    grid = np.zeros((n_rows, n_cols), float)
    for r, c in zip(gi, gj):
        grid[r, c] += 1.0

    n = grid.size
    x = grid.ravel()
    mean = x.mean()
    s = math.sqrt(max((x ** 2).mean() - mean ** 2, 1e-12))

    cells: list[HotspotCell] = []
    for r in range(n_rows):
        for c in range(n_cols):
            if grid[r, c] == 0:
                continue  # only report populated cells
            r0, r1 = max(r - 1, 0), min(r + 2, n_rows)
            c0, c1 = max(c - 1, 0), min(c + 2, n_cols)
            w = (r1 - r0) * (c1 - c0)  # number of neighbours (incl. self), binary weights
            local = grid[r0:r1, c0:c1].sum()
            denom = s * math.sqrt((n * w - w ** 2) / (n - 1)) if n > 1 else 0.0
            z = (local - mean * w) / denom if denom > 0 else 0.0
            expected = mean * w
            times = round(local / expected, 1) if expected > 0 else 1.0
            cells.append(
                HotspotCell(
                    lat=round(lat0 + (r + 0.5) * cell_deg, 6),
                    lng=round(lng0 + (c + 0.5) * cell_deg, 6),
                    count=int(grid[r, c]),
                    gi_z=round(z, 3),
                    significance=_p_label(z),
                    kind="hotspot" if z >= 1.65 else "coldspot" if z <= -1.65 else "ns",
                    times_avg=times,
                    intensity=_intensity_label(z),
                )
            )
    cells.sort(key=lambda h: -abs(h.gi_z))
    return cells[:top]


@dataclass
class Cluster:
    lat: float
    lng: float
    size: int
    radius_m: float
    injured: int
    dominant_species: str | None = None
    area: str | None = None       # dominant ward/place name among members
    members: list[int] = field(default_factory=list)


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    dlat = (lat2 - lat1) * _M_PER_DEG_LAT
    dlng = (lng2 - lng1) * _M_PER_DEG_LNG
    return math.hypot(dlat, dlng)


def dbscan_clusters(
    lats: np.ndarray,
    lngs: np.ndarray,
    species: list[str] | None = None,
    injured: list[bool] | None = None,
    wards: list[str] | None = None,
    eps_m: float = 450.0,
    min_samples: int = 3,
) -> list[Cluster]:
    """Density-based (DBSCAN) clustering of incident points. Points with fewer than `min_samples`
    neighbours within `eps_m` metres are treated as noise and excluded. Returns clusters sorted by
    size (largest first)."""
    n = len(lats)
    if n < min_samples:
        return []
    lats = np.asarray(lats, float)
    lngs = np.asarray(lngs, float)
    # Pairwise distance (metres) via local equirectangular projection - fine at city scale.
    xs = lngs * _M_PER_DEG_LNG
    ys = lats * _M_PER_DEG_LAT
    dx = xs[:, None] - xs[None, :]
    dy = ys[:, None] - ys[None, :]
    dist = np.sqrt(dx ** 2 + dy ** 2)
    neighbours = [np.where(dist[i] <= eps_m)[0] for i in range(n)]

    labels = np.full(n, -1)  # -1 = unvisited/noise
    cluster_id = 0
    visited = np.zeros(n, bool)
    for i in range(n):
        if visited[i]:
            continue
        visited[i] = True
        if len(neighbours[i]) < min_samples:
            continue  # noise (may later be absorbed as a border point)
        labels[i] = cluster_id
        seeds = list(neighbours[i])
        k = 0
        while k < len(seeds):
            j = seeds[k]
            if not visited[j]:
                visited[j] = True
                if len(neighbours[j]) >= min_samples:
                    seeds.extend([m for m in neighbours[j] if m not in seeds])
            if labels[j] == -1:
                labels[j] = cluster_id
            k += 1
        cluster_id += 1

    out: list[Cluster] = []
    for cid in range(cluster_id):
        idx = np.where(labels == cid)[0]
        if len(idx) == 0:
            continue
        clat = float(lats[idx].mean())
        clng = float(lngs[idx].mean())
        radius = max((_haversine_m(clat, clng, lats[m], lngs[m]) for m in idx), default=0.0)
        dom = None
        if species is not None:
            vals = [species[m] for m in idx if species[m]]
            if vals:
                dom = max(set(vals), key=vals.count)
        area = None
        if wards is not None:
            wvals = [wards[m] for m in idx if wards[m]]
            if wvals:
                area = max(set(wvals), key=wvals.count)
        n_inj = int(sum(1 for m in idx if injured and injured[m])) if injured is not None else 0
        out.append(
            Cluster(
                lat=round(clat, 6), lng=round(clng, 6), size=int(len(idx)),
                radius_m=round(radius, 1), injured=n_inj, dominant_species=dom, area=area,
                members=[int(m) for m in idx],
            )
        )
    out.sort(key=lambda c: -c.size)
    return out


def nearest_ward(lat: float, lng: float, lats: np.ndarray, lngs: np.ndarray, wards: list[str]) -> str | None:
    """Ward of the report nearest to (lat, lng) - a CWD-independent way to name a hotspot cell."""
    if len(lats) == 0:
        return None
    d = (np.asarray(lats, float) - lat) ** 2 + (np.asarray(lngs, float) - lng) ** 2
    order = np.argsort(d)
    for i in order:
        if wards[i]:
            return wards[i]
    return None


@dataclass
class WardAnomaly:
    ward: str
    observed: float      # recent mean daily count
    expected: float      # trailing baseline mean
    z: float
    direction: str       # "surge" | "drop"


def ward_anomalies(
    daily_by_ward: dict[str, list[int]], recent_days: int = 3, min_history: int = 7, z_threshold: float = 1.5
) -> list[WardAnomaly]:
    """Per-ward temporal anomaly detection. `daily_by_ward[ward]` is a list of daily counts ordered
    OLDEST->NEWEST. Flags wards whose recent mean deviates from their own trailing baseline by more
    than `z_threshold` standard deviations. Returns anomalies sorted by |z|."""
    out: list[WardAnomaly] = []
    for ward, series in daily_by_ward.items():
        if len(series) < min_history + recent_days:
            continue
        arr = np.asarray(series, float)
        baseline = arr[:-recent_days]
        recent = arr[-recent_days:]
        mu, sd = baseline.mean(), baseline.std()
        if sd < 1e-6:
            sd = math.sqrt(mu) if mu > 0 else 1.0  # Poisson fallback for flat baselines
        z = (recent.mean() - mu) / sd
        if abs(z) >= z_threshold:
            out.append(
                WardAnomaly(
                    ward=ward, observed=round(float(recent.mean()), 2),
                    expected=round(float(mu), 2), z=round(float(z), 2),
                    direction="surge" if z > 0 else "drop",
                )
            )
    out.sort(key=lambda a: -abs(a.z))
    return out
