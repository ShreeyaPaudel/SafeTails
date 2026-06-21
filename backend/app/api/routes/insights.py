"""Dashboard analytics. `/summary` is the single source of truth for every KPI/counter/chart:
live DB aggregates over PUBLISHED reports, so the map, dispatch board and analytics all agree.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from geoalchemy2 import functions as geofunc

from app.api.routes._stub import not_implemented
from app.core.database import get_db
from app.models.report import Report

router = APIRouter()


@router.get("/summary")
def summary(db: Session = Depends(get_db)) -> dict:
    """All counters derived from ONE query over published reports (guaranteed internally consistent)."""
    rows = db.execute(
        select(
            Report.status, Report.injury_status, Report.injury_confidence,
            Report.species_label, Report.ward, Report.created_at,
            Report.species_confidence, Report.species_source, Report.species_user_override,
        )
        .where(Report.moderation_state == "published")
    ).all()

    now = datetime.now(timezone.utc)
    total = len(rows)
    status = {"active": 0, "being_helped": 0, "resolved": 0}
    by_species: dict[str, int] = {}
    injured_by_species: dict[str, int] = {}       # welfare: which species are found injured
    species_conf_sum: dict[str, float] = {}        # mean model confidence per species
    ai_agree = ai_labelled = 0                      # HITL: human labels that matched the model
    wards: dict[str, dict] = {}
    # Severity of OPEN injured cases, derived by one deterministic rule (mirrors the frontend), so
    # every dashboard shows identical counts. Per-ward severe counts drive the map/board indicators.
    severity = {"severe": 0, "moderate": 0, "mild": 0}
    injured = injured_open = last_7 = prev_7 = 0
    daily = [{"reports": 0, "injured": 0} for _ in range(14)]  # index 0 = today

    def _sev(conf: float | None) -> str:
        c = conf if conf is not None else 0.7
        return "severe" if c >= 0.85 else "moderate" if c >= 0.65 else "mild"

    for st, inj, inj_conf, sp, ward, created, sp_conf, sp_src, sp_override in rows:
        status[st] = status.get(st, 0) + 1
        by_species[sp] = by_species.get(sp, 0) + 1
        is_inj = inj == "injured"
        injured += int(is_inj)
        if is_inj:
            injured_by_species[sp] = injured_by_species.get(sp, 0) + 1
        if sp_conf is not None:
            species_conf_sum[sp] = species_conf_sum.get(sp, 0.0) + sp_conf
        # Human-in-the-loop agreement: did the reporter's label match the model's?
        if sp_override:
            ai_labelled += 1
            if sp_override == sp:
                ai_agree += 1
        sev = _sev(inj_conf) if is_inj else None
        if is_inj and st != "resolved":
            injured_open += 1
            severity[sev] += 1
        if ward:
            w = wards.setdefault(ward, {"ward": ward, "reports": 0, "injured": 0, "severe": 0})
            w["reports"] += 1
            w["injured"] += int(is_inj)
            if is_inj and st != "resolved" and sev == "severe":
                w["severe"] += 1
        c = created if created.tzinfo else created.replace(tzinfo=timezone.utc)
        age_days = (now - c).days
        if 0 <= age_days < 7:
            last_7 += 1
        elif 7 <= age_days < 14:
            prev_7 += 1
        if 0 <= age_days < 14:
            daily[age_days]["reports"] += 1
            daily[age_days]["injured"] += int(is_inj)

    daily_series = []
    for off in range(13, -1, -1):
        label = "Today" if off == 0 else "Yest" if off == 1 else f"-{off}d"
        daily_series.append({"day": label, "reports": daily[off]["reports"], "injured": daily[off]["injured"]})

    # Moderation / trust breakdown across ALL reports: the reputation-weighted anti-spam pipeline
    # (published directly / held for peer confirmation / rejected as spam). Thesis contribution.
    mod_rows = db.execute(
        select(Report.moderation_state, func.count()).group_by(Report.moderation_state)
    ).all()
    moderation = {"published": 0, "pending_confirmation": 0, "rejected": 0}
    for state, cnt in mod_rows:
        moderation[state] = moderation.get(state, 0) + int(cnt)
    submitted = sum(moderation.values())

    # Injury rate per species (welfare finding), with mean model confidence.
    injury_by_species = [
        {
            "species": sp,
            "reports": n,
            "injured": injured_by_species.get(sp, 0),
            "injury_rate": round(injured_by_species.get(sp, 0) / n * 100) if n else 0,
            "avg_confidence": round(species_conf_sum.get(sp, 0.0) / n, 3) if n else None,
        }
        for sp, n in sorted(by_species.items(), key=lambda x: -x[1])
    ]

    # --- Response-time analytics: how fast cases get a helper and reach resolution ---
    rt_rows = db.execute(
        select(Report.created_at, Report.first_helped_at, Report.resolved_at)
        .where(Report.moderation_state == "published")
    ).all()

    def _hours(a, b):
        if a is None or b is None:
            return None
        a = a if a.tzinfo else a.replace(tzinfo=timezone.utc)
        b = b if b.tzinfo else b.replace(tzinfo=timezone.utc)
        return max(0.0, (b - a).total_seconds() / 3600.0)

    help_hrs = [h for c, fh, rs in rt_rows if (h := _hours(c, fh)) is not None]
    resolve_hrs = [h for c, fh, rs in rt_rows if (h := _hours(c, rs)) is not None]

    def _avg(xs):
        return round(sum(xs) / len(xs), 1) if xs else None

    def _median(xs):
        if not xs:
            return None
        s = sorted(xs)
        n = len(s)
        return round((s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2), 1)

    # Distribution buckets (hours) for the chart.
    def _bucket(xs):
        b = {"<1h": 0, "1-6h": 0, "6-24h": 0, "1-3d": 0, "3d+": 0}
        for h in xs:
            if h < 1: b["<1h"] += 1
            elif h < 6: b["1-6h"] += 1
            elif h < 24: b["6-24h"] += 1
            elif h < 72: b["1-3d"] += 1
            else: b["3d+"] += 1
        return b

    response = {
        "avg_time_to_help_hrs": _avg(help_hrs),
        "median_time_to_help_hrs": _median(help_hrs),
        "avg_time_to_resolve_hrs": _avg(resolve_hrs),
        "median_time_to_resolve_hrs": _median(resolve_hrs),
        "helped_count": len(help_hrs),
        "resolved_count": len(resolve_hrs),
        "help_distribution": [{"bucket": k, "count": v} for k, v in _bucket(help_hrs).items()],
        "resolve_distribution": [{"bucket": k, "count": v} for k, v in _bucket(resolve_hrs).items()],
    }

    return {
        "total": total,
        "response": response,
        "status": status,
        "active": status["active"],
        "being_helped": status["being_helped"],
        "resolved": status["resolved"],
        "injured": injured,
        "injured_open": injured_open,
        "severity": severity,
        "active_areas": len(wards),
        "by_species": by_species,
        "by_ward": sorted(wards.values(), key=lambda x: -x["reports"])[:10],
        "injury_by_species": injury_by_species,
        "moderation": moderation,
        "submitted": submitted,
        "ai_agreement_rate": round(ai_agree / ai_labelled * 100) if ai_labelled else None,
        "ai_labelled": ai_labelled,
        "daily": daily_series,
        "last_7": last_7,
        "prev_7": prev_7,
        "resolution_rate": round(status["resolved"] / total * 100) if total else 0,
    }


@router.get("/predictions")
def predictions(db: Session = Depends(get_db)) -> dict:
    """Real-data predictive analytics (no simulation):
    - **Area risk score** (0-100) per ward from a transparent weighted model over live features
      (report density, open injured load, severe cases, and recent 7-day activity) -> ranked hotspots.
    - **7-day incident forecast** via least-squares linear regression on the 14-day daily series.
    - **Species-level injury risk** (probability a sighting of species X is injured).
    """
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(Report.ward, Report.injury_status, Report.injury_confidence, Report.status,
               Report.species_label, Report.created_at)
        .where(Report.moderation_state == "published")
    ).all()

    def _sev(conf):
        c = conf if conf is not None else 0.7
        return "severe" if c >= 0.85 else "moderate" if c >= 0.65 else "mild"

    wards: dict[str, dict] = {}
    daily = [0] * 14  # index 0 = today
    sp_tot: dict[str, int] = {}
    sp_inj: dict[str, int] = {}
    for ward, inj, conf, st, sp, created in rows:
        is_inj = inj == "injured"
        c = created if created.tzinfo else created.replace(tzinfo=timezone.utc)
        age = (now - c).days
        if 0 <= age < 14:
            daily[age] += 1
        sp_tot[sp] = sp_tot.get(sp, 0) + 1
        sp_inj[sp] = sp_inj.get(sp, 0) + int(is_inj)
        if not ward:  # ward-less reports still feed the forecast, but can't be a geographic hotspot
            continue
        w = wards.setdefault(ward, {"ward": ward, "reports": 0, "injured": 0,
                             "open_injured": 0, "severe": 0, "recent": 0, "unresolved": 0})
        w["reports"] += 1
        w["injured"] += int(is_inj)
        if st != "resolved":
            w["unresolved"] += 1
        if is_inj and st != "resolved":
            w["open_injured"] += 1
            if _sev(conf) == "severe":
                w["severe"] += 1
        if 0 <= age < 7:
            w["recent"] += 1

    # --- Area risk model: weighted, normalised features -> 0-100 (transparent + explainable) ---
    ws = list(wards.values())
    def _mx(k): return max((w[k] for w in ws), default=0) or 1
    mx = {k: _mx(k) for k in ("reports", "open_injured", "severe", "recent")}
    W = {"reports": 0.25, "open_injured": 0.30, "severe": 0.25, "recent": 0.20}
    for w in ws:
        score = 100 * sum(W[k] * (w[k] / mx[k]) for k in W)
        w["risk_score"] = round(score, 1)
        w["risk_level"] = "high" if score >= 60 else "medium" if score >= 30 else "low"
    ws.sort(key=lambda w: -w["risk_score"])

    # --- 7-day forecast: least-squares line on the 14-day daily counts (oldest -> newest) ---
    series = list(reversed(daily))  # index 0 = 13 days ago ... 13 = today
    import numpy as np
    x = np.arange(len(series), dtype=float)
    y = np.array(series, dtype=float)
    slope, intercept = np.polyfit(x, y, 1) if len(series) >= 2 else (0.0, float(y.mean() if len(y) else 0))
    forecast = [max(0, round(float(slope * (len(series) + i) + intercept), 1)) for i in range(7)]
    hist = [{"day": f"-{13 - i}d" if i < 13 else "Today", "reports": int(series[i])} for i in range(len(series))]
    fc = [{"day": f"+{i + 1}d", "reports": forecast[i]} for i in range(7)]

    species_risk = [
        {"species": sp, "reports": n, "injury_probability": round(sp_inj.get(sp, 0) / n, 3) if n else 0}
        for sp, n in sorted(sp_tot.items(), key=lambda x: -x[1]) if sp != "Unverified"
    ]

    top = ws[0] if ws else None
    return {
        "generated_at": now.isoformat(),
        "area_risk": ws[:12],
        "forecast": {"history": hist, "forecast": fc, "trend_per_day": round(float(slope), 2),
                     "next7_total": int(sum(forecast))},
        "species_injury_risk": species_risk,
        "model": {
            "risk_weights": W,
            "method": "weighted feature model (min-max normalised) + least-squares linear forecast",
        },
        "headline": {
            "top_hotspot": top["ward"] if top else None,
            "top_hotspot_score": top["risk_score"] if top else 0,
            "high_risk_areas": sum(1 for w in ws if w["risk_level"] == "high"),
            "trend": "rising" if slope > 0.15 else "falling" if slope < -0.15 else "steady",
        },
    }


@router.get("/hotspots")
def hotspots(db: Session = Depends(get_db)) -> dict:
    """Spatial decision-support analytics over the live incident geometry (see app.services.spatial):

    - **Getis-Ord Gi\\* hotspots**: statistically-significant spatial clusters (not just high counts).
    - **DBSCAN incident clusters**: density-based groupings that ignore ward boundaries, with noise
      rejection - each with a centroid, radius, dominant species and injured load for dispatch.
    - **Ward anomalies**: per-ward temporal z-score flagging emerging surges vs each ward's baseline.
    """
    import numpy as np

    from app.services import spatial

    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(
            geofunc.ST_Y(Report.geom), geofunc.ST_X(Report.geom),
            Report.species_label, Report.injury_status, Report.ward, Report.created_at,
        ).where(Report.moderation_state == "published")
    ).all()

    lats = np.array([r[0] for r in rows], float) if rows else np.array([])
    lngs = np.array([r[1] for r in rows], float) if rows else np.array([])
    species = [r[2] for r in rows]
    injured = [r[3] == "injured" for r in rows]
    wards_list = [r[4] for r in rows]

    # Per-ward daily series (oldest -> newest) over the last 21 days for anomaly detection.
    HIST = 21
    daily_by_ward: dict[str, list[int]] = {}
    for _, _, _, _, ward, created in rows:
        if not ward:
            continue
        c = created if created.tzinfo else created.replace(tzinfo=timezone.utc)
        age = (now - c).days
        if 0 <= age < HIST:
            series = daily_by_ward.setdefault(ward, [0] * HIST)
            series[HIST - 1 - age] += 1  # newest at the end

    gi = spatial.getis_ord_hotspots(lats, lngs)
    clusters = spatial.dbscan_clusters(lats, lngs, species=species, injured=injured, wards=wards_list)
    anomalies = spatial.ward_anomalies(daily_by_ward)

    # Name each cluster / significant hotspot cell by its nearest report's ward (CWD-independent).
    for c in clusters:
        if not c.area:
            c.area = spatial.nearest_ward(c.lat, c.lng, lats, lngs, wards_list) or "this area"
    sig = [h for h in gi if h.kind == "hotspot" and h.significance in ("p<0.01", "p<0.05")]
    hotspot_dicts = []
    for h in gi:
        d = dict(h.__dict__)
        d["area"] = spatial.nearest_ward(h.lat, h.lng, lats, lngs, wards_list) if h.kind == "hotspot" else None
        hotspot_dicts.append(d)

    SPECIES_PLURAL = {"Dog": "dogs", "Cat": "cats", "Cow": "cows", "Buffalo": "buffalo", "Other": "animals"}

    # --- Plain-language findings (non-technical readers) ---
    findings: list[dict] = []
    top_sig = next((d for d in hotspot_dicts if d["kind"] == "hotspot" and d.get("area")), None)
    if top_sig:
        findings.append({
            "icon": "alert", "tone": "warn",
            "title": f"{top_sig['area']} is a priority zone",
            "text": f"Sightings here are packed about {top_sig['times_avg']}× more tightly than a typical spot across the valley - a {top_sig['intensity']} concentration that is very unlikely to be chance. Proactive patrols here would reach the most animals.",
        })
    if clusters:
        c0 = clusters[0]
        sp = SPECIES_PLURAL.get(c0.dominant_species or "", "animals")
        inj = f", and {c0.injured} of them look injured" if c0.injured else ""
        findings.append({
            "icon": "layers", "tone": "info",
            "title": f"Biggest cluster: {c0.size} sightings near {c0.area}",
            "text": f"These fall within about {int(round(c0.radius_m))} m of each other - mostly {sp}{inj}. A single dispatch trip could cover the whole group.",
        })
    injured_clusters = [c for c in clusters if c.size and c.injured / c.size >= 0.4]
    if injured_clusters:
        ic = max(injured_clusters, key=lambda c: c.injured)
        findings.append({
            "icon": "cross", "tone": "danger",
            "title": f"Injured animals concentrated around {ic.area}",
            "text": f"{ic.injured} of {ic.size} sightings in this cluster are flagged injured - a high-welfare-need pocket worth prioritising.",
        })
    surges = [a for a in anomalies if a.direction == "surge"]
    if surges:
        s0 = surges[0]
        findings.append({
            "icon": "chart", "tone": "warn",
            "title": f"{s0.ward} is heating up",
            "text": f"Reports there have jumped to about {s0.observed} a day recently, well above its usual ~{s0.expected} a day. Something may be developing - worth a closer look.",
        })
    if not findings:
        findings.append({
            "icon": "check", "tone": "ok",
            "title": "No unusual concentrations right now",
            "text": "Sightings are spread fairly evenly and no area is surging beyond its normal level. Nothing needs urgent proactive attention.",
        })

    return {
        "generated_at": now.isoformat(),
        "total_points": len(rows),
        "findings": findings,
        "hotspots": hotspot_dicts,
        "clusters": [
            {k: v for k, v in c.__dict__.items() if k != "members"} for c in clusters[:12]
        ],
        "anomalies": [a.__dict__ for a in anomalies[:8]],
        "headline": {
            "priority_zones": len(sig),
            "top_times_avg": top_sig["times_avg"] if top_sig else (sig[0].times_avg if sig else 1.0),
            "top_hotspot_z": sig[0].gi_z if sig else (gi[0].gi_z if gi else 0),
            "cluster_count": len(clusters),
            "largest_cluster": clusters[0].size if clusters else 0,
            "surging_wards": len(surges),
        },
        "method": {
            "hotspot": "Getis-Ord Gi* local statistic on a 0.005 deg grid (queen contiguity)",
            "clustering": "DBSCAN (eps=450 m, min_samples=3) with noise rejection",
            "anomaly": "per-ward z-score of 3-day activity vs 18-day trailing baseline",
        },
    }


@router.post("/query")
def nl_query():
    """Stretch: natural-language to structured map filter, bounded to existing data."""
    not_implemented("Phase 3.3 (stretch)")
