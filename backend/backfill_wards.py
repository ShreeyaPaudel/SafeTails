"""Backfill report areas that predate working area resolution.

Two classes of row need repair:
  * ward IS NULL   - written while area resolution silently returned nothing, so the report
                     is invisible to the client's area filter.
  * ward not in the canonical list - stored under a name the filter cannot offer.

Both are re-resolved from the report's own (already generalised) coordinates. Idempotent:
rows that already carry a canonical name are left untouched. Pass --apply to write.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from geoalchemy2.shape import to_shape
from sqlalchemy import select

from app.core.config import BASE_DIR
from app.core.database import SessionLocal
from app.models.report import Report
from app.utils.geo import resolve_ward

APPLY = "--apply" in sys.argv

canonical = {a["name"] for a in json.loads(
    (BASE_DIR / "data/kathmandu_areas.json").read_text(encoding="utf-8"))}

db = SessionLocal()
reports = db.scalars(select(Report)).all()

fixed, unresolved, untouched = [], [], 0
for r in reports:
    if r.ward in canonical:
        untouched += 1
        continue
    if r.geom is None:
        unresolved.append((r.id, r.ward, "no geometry"))
        continue
    pt = to_shape(r.geom)
    new = resolve_ward(pt.y, pt.x)
    if new is None:
        unresolved.append((r.id, r.ward, f"outside served region ({pt.y:.4f},{pt.x:.4f})"))
        continue
    fixed.append((r.ward, new))
    if APPLY:
        r.ward = new

print(f"already canonical : {untouched}")
print(f"to repair         : {len(fixed)}")
print(f"cannot resolve    : {len(unresolved)}")

from collections import Counter
for (old, new), n in Counter(fixed).most_common():
    print(f"    {str(old):<16} -> {new:<18} x{n}")
for rid, old, why in unresolved[:10]:
    print(f"    UNRESOLVED {rid} ward={old} ({why})")

if APPLY:
    db.commit()
    print("\nCOMMITTED")
else:
    print("\nDRY RUN - pass --apply to write")
db.close()
