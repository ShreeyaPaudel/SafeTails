"""Seed the local DB with REAL users, reports and photos (Nepali context).

- Real reporter accounts (Samikshya Baniya, Kimti Shrestha, Shreeya Paudel, ...).
- Real animal photos from data/raw/<Class>/ uploaded to Cloudinary (the live image host).
- Species labelled by the in-house CNN; locations are real Kathmandu wards (generalised).
- Varied timestamps, injured/emergency cases, statuses, likes and comments.

Run from repo root with the backend venv:
    backend/.venv/Scripts/python.exe backend/seed_real.py
Idempotent-ish: skips users that already exist; only adds reports if a user has none.
"""
from __future__ import annotations

import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from geoalchemy2.elements import WKTElement  # noqa: E402
from PIL import Image  # noqa: E402

from sqlalchemy import delete, update  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.ml.species import get_classifier  # noqa: E402
from app.models.gamification import UserBadge  # noqa: E402
from app.models.report import HelpRequest, PointEvent, Report, ReportConfirmation  # noqa: E402
from app.models.social import Comment, Like  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import gamification, media  # noqa: E402
from app.utils.geo import generalise_location, resolve_ward  # noqa: E402

random.seed(42)


def reset_data(db) -> None:
    """Clear all reports + derived rows and reset every user's gamification, for a clean reseed."""
    for tbl in (Comment, Like, ReportConfirmation, HelpRequest, PointEvent, Report, UserBadge):
        db.execute(delete(tbl))
    db.execute(update(User).values(points=0, reputation=50.0, level=1))
    db.commit()

USERS = [
    ("Samikshya Baniya", "samikshya", "samikshya@safetails.np"),
    ("Kimti Shrestha", "kimti", "kimti@safetails.np"),
    ("Shreeya Paudel", "shreeya", "shreeya@safetails.np"),
    ("Aayush Karki", "aayush", "aayush@safetails.np"),
    ("Prerana Adhikari", "prerana", "prerana@safetails.np"),
    ("Bibek Gurung", "bibek", "bibek@safetails.np"),
    ("Sneha Maharjan", "sneha", "sneha@safetails.np"),
    ("Roshan Tamang", "roshan", "roshan@safetails.np"),
]
PASSWORD = "password123"

# Real Kathmandu Valley wards (name, lat, lng)
WARDS = [
    ("Thamel", 27.7154, 85.3110), ("Patan", 27.6727, 85.3250), ("Boudha", 27.7215, 85.3620),
    ("Jawalakhel", 27.6710, 85.3110), ("Kalanki", 27.6935, 85.2810), ("New Baneshwor", 27.6915, 85.3420),
    ("Koteshwor", 27.6780, 85.3490), ("Chabahil", 27.7177, 85.3470), ("Maharajgunj", 27.7370, 85.3320),
    ("Balaju", 27.7283, 85.3000), ("Kirtipur", 27.6790, 85.2774), ("Bhaktapur", 27.6710, 85.4298),
    ("Lagankhel", 27.6670, 85.3230), ("Gongabu", 27.7360, 85.3110), ("Satdobato", 27.6580, 85.3260),
]
CLASS_DIRS = {"Dog": "Dog", "Cat": "Cat", "Cow": "Cow", "Buffalo": "Buffalo", "Other": "Other"}
SPECIES_WEIGHTED = ["Dog", "Dog", "Dog", "Cat", "Cat", "Cow", "Buffalo", "Other"]

NOTES = {
    "Dog": ["Brown street dog near {w} chowk, friendly but hungry.",
            "Pack of 3-4 dogs around {w}, all look healthy.",
            "Limping dog near {w}, favouring a back leg.",
            "Puppy wandering near {w} looking for its mother."],
    "Cat": ["Ginger cat near {w}, well fed and friendly.",
            "Kitten near {w} with an infected eye.",
            "Grey cat colony around {w}."],
    "Cow": ["Cow sitting in the middle of {w} junction, blocking traffic.",
            "Cow grazing near {w} underpass, owner not around."],
    "Buffalo": ["Buffalo loose near {w} bypass.",
                "Buffalo with a wound near {w}, limping."],
    "Other": ["Goat near {w}, not sure of the owner.",
              "Injured pigeon near {w} rooftop.",
              "Monkey troop near {w} temple, one looks hurt."],
}
INJ_RATIONALE = {
    "severe": "Lateral recumbency and visible bleeding suggest a likely vehicle collision; urgent.",
    "moderate": "Favouring a limb with a possible open wound; needs a check-up.",
    "mild": "Minor limp / skin irritation; not an acute wound.",
}
COMMENTS = ["I can drop food there this evening.", "Saw the same one yesterday.",
            "Volunteer dispatched, thank you.", "Sharing widely.", "Please contact a vet.",
            "I pass by daily, will check.", "Thank you all."]


def _photo_for(species: str):
    """Return (bytes, stable_public_id) for a random image of this species (id lets Cloudinary
    reuse the same asset across reseeds instead of re-uploading)."""
    d = ROOT / "data" / "raw" / CLASS_DIRS[species]
    files = sorted(d.glob("*.jpg")) if d.exists() else []
    if not files:
        return None, None
    p = random.choice(files)
    return p.read_bytes(), p.stem


def main():
    db = SessionLocal()
    print("Resetting existing reports + gamification for a clean reseed…")
    reset_data(db)
    gamification.ensure_badges_seeded(db)
    clf = get_classifier()
    print("CNN model available:", clf.available, "| Cloudinary:", media._configured())

    users = []
    for name, uname, email in USERS:
        u = db.query(User).filter(User.email == email).first()
        if u is None:
            u = User(email=email, username=uname, display_name=name, hashed_password=hash_password(PASSWORD))
            db.add(u); db.flush()
            print("created user", name)
        users.append(u)
    db.commit()

    now = datetime.now(timezone.utc)
    seeded = 0
    for u in users:
        n = random.randint(6, 12)  # well-distributed, production-like volume per user
        for _ in range(n):
            species = random.choice(SPECIES_WEIGHTED)
            raw, stem = _photo_for(species)
            if raw is None:
                continue
            wname, wlat, wlng = random.choice(WARDS)
            lat = wlat + (random.random() - 0.5) * 0.012
            lng = wlng + (random.random() - 0.5) * 0.012
            glat, glng = generalise_location(lat, lng, 100)
            ward = resolve_ward(glat, glng) or wname

            # Real CNN species (fall back to the folder/ground-truth label if low confidence)
            label, conf = species, None
            try:
                pred = clf.predict(Image.open(__import__("io").BytesIO(raw)))
                if pred.label != "Unverified":
                    label, conf = pred.label, pred.confidence
                else:
                    conf = pred.confidence
            except Exception:
                pass

            cloud_url = media.upload_image(raw, folder="safetails/reports", public_id=stem)
            injured = random.random() < 0.28
            sev = random.choice(["mild", "moderate", "severe"]) if injured else None
            created = now - timedelta(minutes=random.randint(5, 30 * 1440))  # spread over ~30 days
            status = random.choice(["active", "active", "active", "being_helped", "resolved"])
            note = random.choice(NOTES[species]).format(w=wname)
            if injured:
                note += f" [Injury - reporter] {INJ_RATIONALE[sev]}"

            r = Report(
                reporter_id=u.id,
                image_path=cloud_url or "",
                image_phash=None,
                geom=WKTElement(f"POINT({glng} {glat})", srid=4326),
                ward=ward,
                species_label=label,
                species_confidence=conf,
                species_source="cnn",
                species_user_override=species,
                injury_status="injured" if injured else "not_injured",
                injury_confidence=(0.7 + random.random() * 0.25) if injured else 0.9,
                injury_rationale=INJ_RATIONALE[sev] if injured else "No visible wounds or distress detected.",
                note=note,
                spam_score=0.0,
                moderation_state="published",
                status=status,
                created_at=created,
            )
            db.add(r); db.flush()
            seeded += 1

            # a few real likes + comments from other users
            others = [x for x in users if x.id != u.id]
            for liker in random.sample(others, k=random.randint(0, min(4, len(others)))):
                db.add(Like(report_id=r.id, user_id=liker.id))
            for commenter in random.sample(others, k=random.randint(0, 2)):
                db.add(Comment(report_id=r.id, user_id=commenter.id, body=random.choice(COMMENTS)))
        db.commit()
        print(f"  {u.display_name}: seeded reports")

    # Recompute points/reputation/badges from the seeded activity
    for u in users:
        pub = db.query(Report).filter(Report.reporter_id == u.id, Report.moderation_state == "published").all()
        for r in pub:
            gamification.award_points(db, u, "injury_report" if r.injury_status == "injured" else "valid_report", report_id=r.id)
        gamification.recompute_reputation(db, u)
        gamification.check_and_award_badges(db, u)
    db.commit()

    total = db.query(Report).count()
    print(f"\nDone. {seeded} reports seeded this run; {total} total. Users: {len(users)}")
    db.close()


if __name__ == "__main__":
    main()
