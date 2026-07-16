"""Acquire a public, reproducible 5-class animal dataset into data/raw/<Class>/.

Sources (all public, no auth) via the Hugging Face Hub, streamed so we only pull what we cap:
  - Cat, Dog  <- Bingsu/Cat_and_Dog                         (clean cat/dog photos)
  - Cow       <- mlnomad/imnet1k_ox                          (ImageNet "ox" synset)
  - Buffalo   <- mlnomad/imnet1k_water_buffalo_...           (ImageNet "water buffalo" synset)
  - Other     <- a mix of ImageNet synsets (sheep/pig/monkey/bird/goose)

"Other" absorbs non-target animals; "no animal" scenes are handled at inference by the
confidence threshold (see ml/src/config.py), not as a dedicated class.

Usage:
    python -m ml.src.acquire_data --per-class 400
"""
from __future__ import annotations

import argparse
import io
from pathlib import Path

from datasets import load_dataset
from PIL import Image

from ml.src.config import RAW_DIR, SEED, set_global_seed

# class -> list of (dataset_id, kind, match) specs.
#   kind="single"   : every row belongs to the class (single-synset extract)
#   kind="filtered" : keep rows whose ClassLabel name is in `match`
SOURCES: dict[str, list[tuple[str, str, set[str] | None]]] = {
    "Cat": [("Bingsu/Cat_and_Dog", "filtered", {"cat"})],
    "Dog": [("Bingsu/Cat_and_Dog", "filtered", {"dog"})],
    "Cow": [("mlnomad/imnet1k_ox", "single", None)],
    "Buffalo": [
        ("mlnomad/imnet1k_water_buffalo_water_ox_Asiatic_buffalo_Bubalus_bubalis", "single", None),
    ],
    "Other": [
        ("mlnomad/imnet1k_ram_tup", "single", None),
        ("mlnomad/imnet1k_hog_pig_grunter_squealer_Sus_scrofa", "single", None),
        ("mlnomad/imnet1k_macaque", "single", None),
        ("mlnomad/imnet1k_hen", "single", None),
        ("mlnomad/imnet1k_goose", "single", None),
    ],
}


def _to_pil(value) -> Image.Image | None:
    """Coerce a datasets image cell (PIL.Image or {'bytes':...}) to an RGB PIL image."""
    try:
        if isinstance(value, Image.Image):
            return value.convert("RGB")
        if isinstance(value, dict) and value.get("bytes"):
            return Image.open(io.BytesIO(value["bytes"])).convert("RGB")
    except Exception:
        return None
    return None


def _label_column(ds_iter) -> tuple[str | None, list[str] | None]:
    feats = ds_iter.features
    for name, feat in feats.items():
        if getattr(feat, "_type", None) == "ClassLabel" or feat.__class__.__name__ == "ClassLabel":
            return name, list(feat.names)
    return None, None


def acquire_class(cls: str, specs, per_class: int, max_side: int = 512) -> int:
    out_dir = RAW_DIR / cls
    out_dir.mkdir(parents=True, exist_ok=True)
    saved = 0
    for dataset_id, kind, match in specs:
        if saved >= per_class:
            break
        try:
            ds = load_dataset(dataset_id, split="train", streaming=True)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! skip {dataset_id}: {exc}")
            continue

        label_col, names = _label_column(ds) if kind == "filtered" else (None, None)
        # find the image column
        img_col = next((n for n, f in ds.features.items()
                        if f.__class__.__name__ == "Image" or getattr(f, "_type", None) == "Image"), None)
        if img_col is None:
            print(f"  ! skip {dataset_id}: no image column")
            continue

        per_source = per_class if len(specs) == 1 else max(1, per_class // len(specs) + 1)
        taken_here = 0
        for ex in ds:
            if saved >= per_class or taken_here >= per_source:
                break
            if kind == "filtered" and label_col is not None and names is not None:
                lbl = names[ex[label_col]] if isinstance(ex[label_col], int) else str(ex[label_col])
                if lbl.lower() not in {m.lower() for m in (match or set())}:
                    continue
            img = _to_pil(ex[img_col])
            if img is None or min(img.size) < 40:
                continue
            if max(img.size) > max_side:
                img.thumbnail((max_side, max_side))
            img.save(out_dir / f"{cls.lower()}_{saved:05d}.jpg", "JPEG", quality=90)
            saved += 1
            taken_here += 1
        print(f"  {dataset_id}: +{taken_here}  (class total {saved}/{per_class})")
    return saved


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=400)
    ap.add_argument("--max-side", type=int, default=512)
    args = ap.parse_args()
    set_global_seed(SEED)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Acquiring up to {args.per_class} images/class into {RAW_DIR.resolve()}")
    totals = {}
    for cls, specs in SOURCES.items():
        print(f"[{cls}]")
        totals[cls] = acquire_class(cls, specs, args.per_class, args.max_side)
    print("\nDone. Per-class counts:")
    for cls, n in totals.items():
        print(f"  {cls:8s} {n}")


if __name__ == "__main__":
    main()
