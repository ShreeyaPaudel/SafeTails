"""Seed ~200 clearly-labelled DEMO reports across Kathmandu wards & time (Phase 7).

These make the map / feed / leaderboard look populated for the viva. All rows are flagged
`is_demo=True` and reporters are named `demo_*`. The AI pipeline is intentionally bypassed
(no Gemini calls — saves free-tier quota); species/injury are set to plausible demo values.

Run:  python seed_demo.py            # reset demo data + seed 200
      python seed_demo.py 120        # seed 120 instead
Idempotent: it removes prior demo data first.
"""
from __future__ import annotations

import io
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

from geoalchemy2.elements import WKTElement
from PIL import Image, ImageDraw
from sqlalchemy import func, select, text

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.report import Report
from app.models.user import User
from app.services.gamification import (
    check_and_award_badges,
    ensure_badges_seeded,
    level_for_points,
)
from app.utils.geo import generalise_location
from app.utils.images import perceptual_hash, save_image

SEED = 42
random.seed(SEED)

# Approximate centres for Kathmandu/Lalitpur wards (lat, lng).
WARDS = [
    ("Thamel", 27.7154, 85.3110),
    ("Baneshwor", 27.6915, 85.3420),
    ("Lalitpur (Patan)", 27.6730, 85.3250),
    ("Jawalakhel", 27.6710, 85.3140),
    ("Koteshwor", 27.6780, 85.3490),
    ("Boudha", 27.7215, 85.3620),
    ("Chabahil", 27.7170, 85.3470),
    ("Kirtipur", 27.6790, 85.2770),
    ("Kalanki", 27.6935, 85.2810),
    ("Maharajgunj", 27.7370, 85.3310),
    ("Swayambhu", 27.7150, 85.2900),
    ("Balaju", 27.7360, 85.3020),
    ("Gongabu", 27.7350, 85.3170),
    ("Satdobato", 27.6585, 85.3250),
    ("New Baneshwor", 27.6890, 85.3370),
]
SPECIES = ["Dog", "Cat", "Cow", "Buffalo", "Other"]
SPECIES_WEIGHTS = [0.42, 0.28, 0.12, 0.10, 0.08]
STATUSES = ["active", "being_helped", "resolved"]
STATUS_WEIGHTS = [0.6, 0.2, 0.2]

DEMO_RATIONALES = {
    "injured": [
        "Visible limp on the hind leg.",
        "Open wound near the shoulder.",
        "Appears weak and is bleeding slightly.",
    ],
    "not_injured": [
        "Animal looks healthy and alert.",
        "No visible injuries.",
        "Moving normally, good body condition.",
    ],
}


def make_species_images() -> dict[str, list[str]]:
    """Generate a few labelled placeholder JPEGs per species; return species -> [paths]."""
    palette = {
        "Dog": (37, 99, 235),
        "Cat": (219, 39, 119),
        "Cow": (22, 163, 74),
        "Buffalo": (124, 58, 237),
        "Other": (100, 116, 139),
    }
    out: dict[str, list[str]] = {}
    for sp in SPECIES:
        paths = []
        for v in range(3):
            base = palette[sp]
            img = Image.new("RGB", (480, 360), tuple(min(255, c + v * 18) for c in base))
            d = ImageDraw.Draw(img)
            d.ellipse([150, 110, 330, 290], fill=tuple(max(0, c - 40) for c in base))
            d.text((20, 20), f"{sp}", fill="white")
            d.text((20, 330), "DEMO DATA", fill="white")
            paths.append(save_image(img, settings.upload_path))
        out[sp] = paths
    return out


def reset_demo(db) -> None:
    """Remove previously-seeded demo data so the script is idempotent."""
    demo_user_ids = "(SELECT id FROM users WHERE username LIKE :pfx)"
    demo_report_ids = "(SELECT id FROM reports WHERE is_demo = true)"
    for stmt in [
        f"DELETE FROM point_events WHERE report_id IN {demo_report_ids} OR user_id IN {demo_user_ids}",
        f"DELETE FROM report_confirmations WHERE report_id IN {demo_report_ids}",
        f"DELETE FROM likes WHERE report_id IN {demo_report_ids}",
        f"DELETE FROM comments WHERE report_id IN {demo_report_ids}",
        f"DELETE FROM user_badges WHERE user_id IN {demo_user_ids}",
        "DELETE FROM reports WHERE is_demo = true",
        "DELETE FROM users WHERE username LIKE :pfx",
    ]:
        db.execute(text(stmt), {"pfx": "demo\\_%"})  # \_ = literal underscore
    db.commit()


def seed(n: int = 200) -> None:
    db = SessionLocal()
    try:
        reset_demo(db)
        ensure_badges_seeded(db)

        # Demo reporters
        users = []
        for i in range(1, 11):
            u = User(
                email=f"demo{i}@straywatch.local",
                username=f"demo_reporter{i}",
                hashed_password=hash_password("demopassword123"),
                display_name=f"Demo Reporter {i}",
                reputation=round(random.uniform(45, 95), 1),
                points=0,
                level=1,
            )
            db.add(u)
            users.append(u)
        db.flush()

        now = datetime.now(timezone.utc)
        images = make_species_images()
        for _ in range(n):
            owner = random.choice(users)
            sp = random.choices(SPECIES, SPECIES_WEIGHTS)[0]
            ward, wlat, wlng = random.choice(WARDS)
            # jitter around ward centre, then generalise (privacy)
            lat = wlat + random.uniform(-0.01, 0.01)
            lng = wlng + random.uniform(-0.01, 0.01)
            glat, glng = generalise_location(lat, lng, settings.location_grid_meters)
            injured = random.random() < 0.22
            injury_status = "injured" if injured else "not_injured"
            created = now - timedelta(
                days=random.randint(0, 56), hours=random.randint(0, 23), minutes=random.randint(0, 59)
            )
            img_path = random.choice(images[sp])
            with Image.open(img_path) as im:
                phash = perceptual_hash(im)

            report = Report(
                reporter_id=owner.id,
                image_path=img_path,
                image_phash=phash,
                geom=WKTElement(f"POINT({glng} {glat})", srid=4326),
                ward=ward,
                species_label=sp,
                species_confidence=round(random.uniform(0.72, 0.98), 3),
                species_source="cnn",
                injury_status=injury_status,
                injury_confidence=round(random.uniform(0.6, 0.95), 3),
                injury_rationale=random.choice(DEMO_RATIONALES[injury_status]),
                spam_score=0.0,
                moderation_state="published",
                status=random.choices(STATUSES, STATUS_WEIGHTS)[0],
                is_demo=True,
                created_at=created,
            )
            db.add(report)
            owner.points += 10
        db.flush()

        for u in users:
            u.level = level_for_points(u.points)
            check_and_award_badges(db, u)
        db.commit()

        total = db.scalar(select(func.count()).select_from(Report).where(Report.is_demo.is_(True)))
        print(f"Seeded {n} demo reports across {len(WARDS)} wards, owned by {len(users)} demo reporters.")
        print(f"Total demo reports now in DB: {total}")
    finally:
        db.close()


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    seed(count)
