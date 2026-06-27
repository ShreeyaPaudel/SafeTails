"""Comprehensive demo seed - a large, realistic dataset so every data-driven feature
(analytics, risk/prediction, leaderboards, hotspots, heatmaps, response times, moderation,
adoptions, AI feedback, saved reports) is richly populated.

Design:
  * Generates ~500 demo reports (is_demo=True) across many users, wards, species, confidence
    levels, timestamps (90 days, recency-weighted), verification states and AI outcomes.
  * Reuses existing photo URLs already in the DB (no Cloudinary/CNN calls -> fast + reliable),
    matched by species where possible.
  * Preserves your REAL reports (is_demo=False); only clears previous demo data on reseed.
  * Recomputes points/reputation/badges from the seeded activity so leaderboards look production-like.

Run from repo root with the backend venv:
    backend/.venv/Scripts/python.exe backend/seed_comprehensive.py
"""
from __future__ import annotations

import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from geoalchemy2.elements import WKTElement  # noqa: E402
from sqlalchemy import delete, func, select, update  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.adoption import Adoption  # noqa: E402
from app.models.gamification import UserBadge  # noqa: E402
from app.models.report import AIFeedback, HelpRequest, PointEvent, Report, ReportConfirmation  # noqa: E402
from app.models.social import Comment, Like, SavedReport  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import gamification  # noqa: E402
from app.utils.geo import generalise_location, resolve_ward  # noqa: E402

random.seed(42)

TARGET_REPORTS = 500

DEMO_USERS = [
    ("Samikshya Baniya", "samikshya"), ("Kimti Shrestha", "kimti"), ("Shreeya Paudel", "shreeya"),
    ("Aayush Karki", "aayush"), ("Prerana Adhikari", "prerana"), ("Bibek Gurung", "bibek"),
    ("Sneha Maharjan", "sneha"), ("Roshan Tamang", "roshan"), ("Manish Shakya", "manish"),
    ("Anisha Rai", "anisha"), ("Dipesh Thapa", "dipesh"), ("Nabin Lama", "nabin"),
    ("Puja Bhandari", "puja"), ("Sujan Koirala", "sujan"), ("Riya Manandhar", "riya"),
]
PASSWORD = "password123"

WARDS = [
    ("Thamel", 27.7154, 85.3110), ("Patan", 27.6727, 85.3250), ("Boudha", 27.7215, 85.3620),
    ("Jawalakhel", 27.6710, 85.3110), ("Kalanki", 27.6935, 85.2810), ("New Baneshwor", 27.6915, 85.3420),
    ("Koteshwor", 27.6780, 85.3490), ("Chabahil", 27.7177, 85.3470), ("Maharajgunj", 27.7370, 85.3320),
    ("Balaju", 27.7283, 85.3000), ("Kirtipur", 27.6790, 85.2774), ("Bhaktapur", 27.6710, 85.4298),
    ("Lagankhel", 27.6670, 85.3230), ("Gongabu", 27.7360, 85.3110), ("Satdobato", 27.6580, 85.3260),
    ("Baneshwor", 27.6890, 85.3380), ("Sinamangal", 27.6960, 85.3560), ("Swayambhu", 27.7149, 85.2903),
]
# Some wards are deliberately hotter (drives hotspot/risk analytics to find real concentrations).
WARD_WEIGHTS = {"Kalanki": 3.0, "Gongabu": 2.6, "Koteshwor": 2.2, "Thamel": 2.0, "New Baneshwor": 1.8}

SPECIES = ["Dog", "Cat", "Cow", "Buffalo", "Other"]
SPECIES_WEIGHTS = [0.42, 0.24, 0.13, 0.11, 0.10]
# Per-species injury propensity (welfare realism: cattle on roads get hurt more often).
INJURY_RATE = {"Dog": 0.26, "Cat": 0.18, "Cow": 0.34, "Buffalo": 0.38, "Other": 0.22}

NOTES = {
    "Dog": ["Brown street dog near {w} chowk, friendly but hungry.",
            "Pack of 3-4 dogs around {w}, all look healthy.",
            "Limping dog near {w}, favouring a back leg.",
            "Puppy wandering near {w} looking for its mother.",
            "Old dog resting outside a shop in {w}, seems weak."],
    "Cat": ["Ginger cat near {w}, well fed and friendly.",
            "Kitten near {w} with an infected eye.",
            "Grey cat colony around {w}.",
            "Black cat stuck on a {w} rooftop, meowing."],
    "Cow": ["Cow sitting in the middle of {w} junction, blocking traffic.",
            "Cow grazing near {w} underpass, owner not around.",
            "Cow with a limp near {w}, avoiding the road."],
    "Buffalo": ["Buffalo loose near {w} bypass.",
                "Buffalo with a wound near {w}, limping.",
                "Two buffaloes wandering the {w} ring road."],
    "Other": ["Goat near {w}, not sure of the owner.",
              "Injured pigeon near {w} rooftop.",
              "Monkey troop near {w} temple, one looks hurt.",
              "Stray goat kid near {w}, no mother in sight."],
}
INJ_RATIONALE = {
    "severe": "Lateral recumbency and visible bleeding suggest a likely vehicle collision; urgent.",
    "moderate": "Favouring a limb with a possible open wound; needs a check-up.",
    "mild": "Minor limp / skin irritation; not an acute wound.",
}
HEALTHY_RATIONALE = "No visible wounds, limping or distress cues detected in the image."
COMMENTS = ["I can drop food there this evening.", "Saw the same one yesterday.",
            "Volunteer dispatched, thank you.", "Sharing widely.", "Please contact a vet.",
            "I pass by daily, will check.", "Thank you all.", "Reported to the shelter too.",
            "It moved to the next street now.", "Someone please help this one."]

ADOPTIONS = [
    ("Friendly brown pup, ~3 months", "Rescued near Kalanki, dewormed and playful. Great with kids."),
    ("Ginger cat, litter-trained", "Very affectionate, spayed and vaccinated. Indoor home preferred."),
    ("Gentle older dog", "Calm senior dog, house-trained. Needs a quiet home."),
    ("Two bonded kittens", "Rescued together near Patan, must be adopted as a pair."),
    ("Black-and-white pup", "Energetic and healthy, ~4 months, first vaccines done."),
    ("Tabby cat, ~1 year", "Found near Boudha, friendly once settled."),
]


def clear_demo(db) -> None:
    """Remove only previous DEMO reports + their derived rows; keep real (is_demo=False) reports."""
    demo_ids = list(db.scalars(select(Report.id).where(Report.is_demo == True)))  # noqa: E712
    if demo_ids:
        for tbl in (Comment, Like, ReportConfirmation, HelpRequest, PointEvent, AIFeedback, SavedReport):
            db.execute(delete(tbl).where(tbl.report_id.in_(demo_ids)))
        db.execute(update(Adoption).where(Adoption.report_id.in_(demo_ids)).values(report_id=None))
        db.execute(delete(Report).where(Report.id.in_(demo_ids)))
    db.execute(delete(Adoption).where(Adoption.title.in_([t for t, _ in ADOPTIONS])))
    db.commit()
    print(f"Cleared {len(demo_ids)} previous demo reports.")


def species_probs(label: str, conf: float) -> dict:
    """A realistic per-class distribution that puts `conf` on the label and spreads the rest."""
    others = [s for s in SPECIES if s != label]
    rest = max(0.0, 1.0 - conf)
    weights = [random.random() for _ in others]
    tot = sum(weights) or 1.0
    d = {label: round(conf, 4)}
    for s, w in zip(others, weights):
        d[s] = round(rest * w / tot, 4)
    return d


def weighted_ward():
    names = [w[0] for w in WARDS]
    weights = [WARD_WEIGHTS.get(n, 1.0) for n in names]
    return random.choices(WARDS, weights=weights, k=1)[0]


def main():
    db = SessionLocal()
    print("Comprehensive seed starting…")
    clear_demo(db)
    gamification.ensure_badges_seeded(db)

    # Users: ensure the demo cohort exists (real Gmail accounts are left untouched).
    users = []
    for name, uname in DEMO_USERS:
        email = f"{uname}@safetails.np"
        u = db.scalar(select(User).where(User.email == email))
        if u is None:
            u = User(email=email, username=uname, display_name=name, hashed_password=hash_password(PASSWORD))
            db.add(u); db.flush()
        users.append(u)
    db.commit()
    all_users = list(db.scalars(select(User)))  # include real users for likes/comments/help

    # Photo pool: reuse image URLs already in the DB, grouped by species (no external calls).
    pool: dict[str, list[str]] = {s: [] for s in SPECIES}
    any_urls: list[str] = []
    for label, path in db.execute(select(Report.species_label, Report.image_path)).all():
        if path and str(path).startswith("http"):
            any_urls.append(path)
            if label in pool:
                pool[label].append(path)

    def pick_photo(sp: str) -> str:
        if pool.get(sp):
            return random.choice(pool[sp])
        return random.choice(any_urls) if any_urls else ""

    now = datetime.now(timezone.utc)
    seeded = 0
    created_reports: list[Report] = []

    for _ in range(TARGET_REPORTS):
        reporter = random.choice(users)
        sp = random.choices(SPECIES, weights=SPECIES_WEIGHTS, k=1)[0]
        wname, wlat, wlng = weighted_ward()
        lat = wlat + (random.random() - 0.5) * 0.014
        lng = wlng + (random.random() - 0.5) * 0.014
        glat, glng = generalise_location(lat, lng, 100)
        ward = resolve_ward(glat, glng) or wname

        # Confidence: mostly good, some low -> Unverified (exercises the confidence distribution).
        r = random.random()
        if r < 0.12:
            conf = round(random.uniform(0.40, 0.68), 3)
            label = "Unverified" if conf < 0.55 else sp
        elif r < 0.45:
            conf = round(random.uniform(0.68, 0.85), 3); label = sp
        else:
            conf = round(random.uniform(0.85, 0.99), 3); label = sp
        probs_label = sp  # distribution always reflects the true class
        all_probs = species_probs(probs_label, conf)

        injured = random.random() < INJURY_RATE[sp]
        sev = random.choices(["mild", "moderate", "severe"], weights=[0.45, 0.35, 0.20])[0] if injured else None
        inj_conf = round({"severe": random.uniform(0.86, 0.98), "moderate": random.uniform(0.66, 0.84),
                          "mild": random.uniform(0.5, 0.64)}[sev], 3) if injured else round(random.uniform(0.88, 0.98), 3)

        # Timestamp: 90 days, recency-weighted (squares bias toward recent -> lively trends/weekly board).
        age_days = int((random.random() ** 2) * 90)
        created = now - timedelta(days=age_days, minutes=random.randint(0, 1439))

        # Verification state: mostly published; some pending; a few rejected-as-spam.
        v = random.random()
        if injured:
            mod = "published"  # emergency fast-track
        elif v < 0.78:
            mod = "published"
        elif v < 0.92:
            mod = "pending_confirmation"
        else:
            mod = "rejected"

        note = random.choice(NOTES[sp]).format(w=wname)
        if injured:
            note += f" [Injury - reporter] {INJ_RATIONALE[sev]}"

        # Lifecycle + response-time stamps.
        status = "active"
        first_helped_at = resolved_at = None
        helper_id = None
        if mod == "published":
            s = random.random()
            if s < 0.30:
                status = "resolved"
                fh = created + timedelta(hours=random.uniform(0.3, 40))
                first_helped_at = fh
                resolved_at = fh + timedelta(hours=random.uniform(0.5, 60))
                helper_id = random.choice([x.id for x in all_users if x.id != reporter.id])
            elif s < 0.48:
                status = "being_helped"
                first_helped_at = created + timedelta(hours=random.uniform(0.3, 30))
                helper_id = random.choice([x.id for x in all_users if x.id != reporter.id])

        spam_score = 0.0
        spam_reasons = None
        if mod == "rejected":
            spam_score = round(random.uniform(0.72, 0.95), 3)
            spam_reasons = {
                "reasons": ["Near-duplicate image submitted recently nearby", "Reporter reputation below the publish bar"],
                "decision": ["held: duplicate image", "rejected: community-flagged as spam"],
                "components": {"duplicate_image": 1.0, "reputation_deficit": round(random.uniform(0.4, 0.8), 2),
                               "community_flags": round(random.uniform(0.5, 1.0), 2)},
            }

        rep = Report(
            reporter_id=reporter.id,
            image_path=pick_photo(sp),
            image_phash=None,
            extra_images=None,
            geom=WKTElement(f"POINT({glng} {glat})", srid=4326),
            ward=ward,
            species_label=label,
            species_confidence=conf,
            species_source="cnn",
            species_all_probs=all_probs,
            species_user_override=sp,
            injury_status="injured" if injured else "not_injured",
            injury_confidence=inj_conf,
            injury_rationale=INJ_RATIONALE[sev] if injured else HEALTHY_RATIONALE,
            ai_injury_status="injured" if injured else "not_injured",
            ai_injury_confidence=inj_conf,
            ai_injury_rationale=INJ_RATIONALE[sev] if injured else HEALTHY_RATIONALE,
            injury_user_override=False,
            note=note,
            spam_score=spam_score,
            spam_reasons=spam_reasons,
            moderation_state=mod,
            status=status,
            helper_id=helper_id,
            first_helped_at=first_helped_at,
            resolved_at=resolved_at,
            is_demo=True,
            created_at=created,
        )
        db.add(rep); db.flush()
        created_reports.append(rep)
        seeded += 1

        others = [x for x in all_users if x.id != reporter.id]
        # Likes + comments (published only, recency-weighted engagement).
        if mod == "published":
            for liker in random.sample(others, k=random.randint(0, min(6, len(others)))):
                db.add(Like(report_id=rep.id, user_id=liker.id))
            for commenter in random.sample(others, k=random.randint(0, 3)):
                db.add(Comment(report_id=rep.id, user_id=commenter.id, body=random.choice(COMMENTS)))
        # Peer confirmations (drives verification analytics + AI-agreement). One vote per voter.
        voted: set = set()
        for voter in random.sample(others, k=random.randint(0, min(3, len(others)))):
            vote = "confirm" if random.random() < 0.85 else random.choice(["flag_spam", "flag_invalid"])
            db.add(ReportConfirmation(report_id=rep.id, user_id=voter.id, vote=vote))
            voted.add(voter.id)
        # Rejected reports collect a couple of spam flags (from voters who haven't voted yet).
        if mod == "rejected":
            for voter in [x for x in others if x.id not in voted][:2]:
                db.add(ReportConfirmation(report_id=rep.id, user_id=voter.id, vote="flag_spam"))
                voted.add(voter.id)
        # Help requests on some open injured cases.
        if injured and status == "active" and random.random() < 0.4:
            helper = random.choice(others)
            db.add(HelpRequest(report_id=rep.id, helper_id=helper.id, status="pending",
                               message=random.choice(["On my way.", "I can take it to the vet.", "Nearby, will check."])))
        # AI feedback on a subset (responsible-AI signal).
        if random.random() < 0.15:
            fb = random.choice(others)
            db.add(AIFeedback(report_id=rep.id, user_id=fb.id, target=random.choice(["species", "injury"]),
                              agree=random.random() < 0.82))

        if seeded % 100 == 0:
            db.commit()
            print(f"  …{seeded} reports")
    db.commit()

    # Saved reports (bookmarks) for a spread of users.
    pub_ids = [r.id for r in created_reports if r.moderation_state == "published"]
    for u in random.sample(all_users, k=min(8, len(all_users))):
        for rid in random.sample(pub_ids, k=random.randint(2, 8)):
            if not db.scalar(select(SavedReport).where(SavedReport.user_id == u.id, SavedReport.report_id == rid)):
                db.add(SavedReport(user_id=u.id, report_id=rid))
    db.commit()

    # Adoption listings.
    for (title, desc), lister in zip(ADOPTIONS, random.sample(users, k=len(ADOPTIONS))):
        db.add(Adoption(created_by=lister.id, title=title, description=desc,
                        contact_info=f"{lister.username}@safetails.np", status="available",
                        photo_path=pick_photo(random.choice(["Dog", "Cat"]))))
    db.commit()

    # --- Recompute gamification from the seeded activity (points/reputation/badges) ---
    print("Recomputing gamification…")
    for u in all_users:
        pub = db.scalars(select(Report).where(Report.reporter_id == u.id, Report.moderation_state == "published")).all()
        for r in pub:
            gamification.award_points(db, u, "injury_report" if r.injury_status == "injured" else "valid_report", report_id=r.id)
            if r.status == "resolved":
                gamification.award_points(db, u, "resolved", report_id=r.id)
        # helping credit
        helped = db.scalars(select(Report).where(Report.helper_id == u.id)).all()
        for r in helped:
            gamification.award_points(db, u, "helped", report_id=r.id)
        # confirming credit
        confirms = db.scalar(select(func.count()).select_from(ReportConfirmation).where(
            ReportConfirmation.user_id == u.id, ReportConfirmation.vote == "confirm")) or 0
        for _ in range(int(confirms)):
            gamification.award_points(db, u, "confirm_vote")
        gamification.recompute_reputation(db, u)
        gamification.check_and_award_badges(db, u)
    db.commit()

    total = db.query(Report).count()
    pub = db.query(Report).filter(Report.moderation_state == "published").count()
    print(f"\nDone. Seeded {seeded} demo reports. Total reports now: {total} (published {pub}). Users: {len(users)} demo.")
    db.close()


if __name__ == "__main__":
    main()
