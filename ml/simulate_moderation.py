"""Computational evaluation of the reputation-weighted moderation mechanism.

Imports the ACTUAL production functions from the backend services and drives them with
modelled contributor archetypes, so this measures the implemented mechanism rather than a
re-description of it.

What this establishes: whether the specified rules separate contribution profiles as the design
intends, and what a contributor of each type experiences over a reporting history.
What it does NOT establish: that real users behave like these archetypes. The archetypes encode
the designer's model of behaviour, so this is a test of the MECHANISM, not of human conduct.

Run:  python ml/simulate_moderation.py
Writes ml/exported/simulation.json
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.antispam import (  # noqa: E402
    NEW_ACCOUNT_HOURS, RATE_LIMIT_24H, REP_PUBLISH_THRESHOLD, REP_TRUSTED_THRESHOLD,
    SPAM_HOLD_THRESHOLD, decide_moderation,
)
from app.services.gamification import POINTS, compute_reputation, level_for_points  # noqa: E402

SEED = 42
random.seed(SEED)
N_REPORTS = 40          # reporting history length per simulated contributor
N_RUNS = 200            # independent contributors per archetype

# Archetypes: probability a report is peer-confirmed, agrees with the classifier, is flagged,
# is a duplicate resubmission, plus reports attempted per 24h window.
ARCHETYPES = {
    "Careful genuine":   dict(p_confirm=0.90, p_agree=0.85, p_flag=0.02, p_dup=0.00, per_day=2),
    "Casual genuine":    dict(p_confirm=0.70, p_agree=0.60, p_flag=0.05, p_dup=0.00, per_day=1),
    "Careless":          dict(p_confirm=0.35, p_agree=0.30, p_flag=0.25, p_dup=0.05, per_day=3),
    "Volume farmer":     dict(p_confirm=0.20, p_agree=0.25, p_flag=0.30, p_dup=0.10, per_day=25),
    "Duplicate farmer":  dict(p_confirm=0.10, p_agree=0.20, p_flag=0.35, p_dup=0.80, per_day=8),
    "Abusive":           dict(p_confirm=0.05, p_agree=0.15, p_flag=0.70, p_dup=0.20, per_day=6),
}


def spam_score_from(dup: bool, over_rate: bool, flag_rate: float) -> float:
    """Deterministic-guard contribution to the suspicion score (delegated tier assumed offline,
    which is the conservative case: the mechanism must work without the external model)."""
    s = 0.0
    if dup:
        s = max(s, 0.8)
    if over_rate:
        s = max(s, 0.7)
    s = max(s, min(flag_rate, 1.0) * 0.6)
    return round(min(s, 1.0), 3)


def run_contributor(cfg: dict) -> dict:
    confirmed = agreed = labelled = flagged = total = 0
    points = 0
    published = held = 0
    reputation = compute_reputation(0, 0, 0, 0, 0, 0)  # neutral start
    age_hours = 0.0
    day_count = 0
    rep_trace = [reputation]

    for i in range(N_REPORTS):
        # advance time: how long to accumulate this report given the archetype's daily rate
        age_hours += 24.0 / max(cfg["per_day"], 1)
        day_count = int(age_hours // 24)
        submitted_today = min(cfg["per_day"], RATE_LIMIT_24H + 20)
        over_rate = submitted_today > RATE_LIMIT_24H
        is_dup = random.random() < cfg["p_dup"]
        flag_rate_so_far = flagged / total if total else 0.0
        score = spam_score_from(is_dup, over_rate, flag_rate_so_far)

        state, _ = decide_moderation(reputation, age_hours, score, is_dup, over_rate)

        total += 1
        this_confirmed = random.random() < cfg["p_confirm"]
        this_flagged = random.random() < cfg["p_flag"]
        user_labelled = random.random() < 0.8
        if user_labelled:
            labelled += 1
            if random.random() < cfg["p_agree"]:
                agreed += 1
        if this_flagged:
            flagged += 1

        if state == "published":
            published += 1
            points += POINTS["valid_report"]
            if user_labelled and random.random() < cfg["p_agree"]:
                points += POINTS["ai_agreement"]
        else:
            held += 1
            # a held report only earns if peers confirm it
            if this_confirmed and not is_dup and not over_rate:
                confirmed += 1
                points += POINTS["valid_report"] + POINTS["peer_confirmed"]
        if this_flagged:
            points = max(0, points + POINTS["spam_penalty"])

        reputation = compute_reputation(confirmed, total, agreed, labelled, flagged, total)
        rep_trace.append(reputation)

    return {
        "reputation": reputation, "points": points, "level": level_for_points(points),
        "published": published, "held": held,
        "publish_rate": published / N_REPORTS,
        "points_per_report": points / N_REPORTS,
        "reached_trusted": reputation >= REP_TRUSTED_THRESHOLD,
        "above_publish_threshold": reputation >= REP_PUBLISH_THRESHOLD,
        "trace": rep_trace,
    }


def mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


results = {}
traces = {}
for name, cfg in ARCHETYPES.items():
    runs = [run_contributor(cfg) for _ in range(N_RUNS)]
    results[name] = {
        "reputation_mean": round(mean([r["reputation"] for r in runs]), 2),
        "reputation_min": round(min(r["reputation"] for r in runs), 2),
        "reputation_max": round(max(r["reputation"] for r in runs), 2),
        "points_mean": round(mean([r["points"] for r in runs]), 1),
        "points_per_report": round(mean([r["points_per_report"] for r in runs]), 2),
        "publish_rate": round(mean([r["publish_rate"] for r in runs]), 3),
        "pct_reached_trusted": round(100 * mean([1.0 if r["reached_trusted"] else 0.0 for r in runs]), 1),
        "pct_above_publish_threshold": round(100 * mean([1.0 if r["above_publish_threshold"] else 0.0 for r in runs]), 1),
        "level_mean": round(mean([r["level"] for r in runs]), 2),
    }
    # median trace for plotting
    runs_sorted = sorted(runs, key=lambda r: r["reputation"])
    traces[name] = [round(v, 2) for v in runs_sorted[len(runs_sorted) // 2]["trace"]]

genuine = mean([results[k]["points_per_report"] for k in ["Careful genuine", "Casual genuine"]])
gaming = mean([results[k]["points_per_report"] for k in ["Volume farmer", "Duplicate farmer", "Abusive"]])

out = {
    "seed": SEED, "n_reports": N_REPORTS, "n_runs_per_archetype": N_RUNS,
    "parameters": {
        "rep_publish_threshold": REP_PUBLISH_THRESHOLD,
        "rep_trusted_threshold": REP_TRUSTED_THRESHOLD,
        "spam_hold_threshold": SPAM_HOLD_THRESHOLD,
        "rate_limit_24h": RATE_LIMIT_24H,
        "new_account_hours": NEW_ACCOUNT_HOURS,
        "points": POINTS,
    },
    "archetypes": {k: ARCHETYPES[k] for k in ARCHETYPES},
    "results": results,
    "traces": traces,
    "separation": {
        "genuine_points_per_report": round(genuine, 2),
        "gaming_points_per_report": round(gaming, 2),
        "ratio": round(genuine / gaming, 2) if gaming else None,
    },
}

(ROOT / "ml" / "exported" / "simulation.json").write_text(json.dumps(out, indent=1))
print(f"{'archetype':<18}{'rep':>8}{'pts/report':>12}{'publish':>9}{'trusted%':>10}")
for k, v in results.items():
    print(f"{k:<18}{v['reputation_mean']:>8}{v['points_per_report']:>12}{v['publish_rate']:>9}{v['pct_reached_trusted']:>10}")
print(f"\ngenuine {genuine:.2f} vs gaming {gaming:.2f} points/report  ratio {genuine/gaming:.2f}x")
print("wrote ml/exported/simulation.json")
