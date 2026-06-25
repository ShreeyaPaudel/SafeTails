"""Image handling: EXIF stripping (privacy), perceptual hashing, storage.

Re-encoding the decoded pixels to a fresh JPEG drops ALL embedded metadata (GPS, device,
timestamps) - this is the EXIF-stripping guarantee required by docs/ETHICS.md.
"""
from __future__ import annotations

import io
import uuid
from pathlib import Path

import imagehash
from PIL import Image, ImageOps, UnidentifiedImageError


class InvalidImageError(ValueError):
    """Raised when an upload is not a decodable image."""


def load_clean_image(raw: bytes) -> Image.Image:
    """Decode bytes, apply EXIF orientation, then return an RGB image with no metadata."""
    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)  # bake in orientation before we discard EXIF
        return img.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageError("Uploaded file is not a valid image") from exc


def perceptual_hash(img: Image.Image) -> str:
    """Stable perceptual hash (used for duplicate detection in the anti-spam guards)."""
    return str(imagehash.phash(img))


def to_jpeg_bytes(img: Image.Image) -> bytes:
    """Encode an image to metadata-free JPEG bytes (for sending to Gemini, etc.)."""
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def to_web_jpeg(img: Image.Image, max_dim: int = 1600, quality: int = 82) -> bytes:
    """Downscaled, metadata-free JPEG for hosting/display. Large phone photos (multi-MB) upload
    much faster once bounded to `max_dim` on the long edge, with no visible quality loss."""
    im = img.convert("RGB")
    w, h = im.size
    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def to_ai_jpeg(img: Image.Image, max_dim: int = 1024, quality: int = 85) -> bytes:
    """Bounded, metadata-free JPEG for the hosted vision model.

    A full-resolution phone photo is several megabytes; uploading that on a slow link routinely
    exceeded the request timeout, which surfaced as an "unknown" injury assessment even though
    the model was reachable. Bounding the long edge to `max_dim` cuts a typical 1.7 MB payload
    to roughly 0.2 MB while leaving wounds, limps and dressings clearly legible.
    """
    return to_web_jpeg(img, max_dim=max_dim, quality=quality)


def to_avatar_jpeg(img: Image.Image, size: int = 512, quality: int = 85) -> bytes:
    """Square, centre-cropped, metadata-free JPEG for profile photos (optimised for display)."""
    im = img.convert("RGB")
    w, h = im.size
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    im = im.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def save_image(img: Image.Image, upload_dir: str) -> str:
    """Persist as a fresh JPEG (metadata-free). Returns the saved path."""
    out_dir = Path(upload_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{uuid.uuid4().hex}.jpg"
    img.save(path, format="JPEG", quality=90)
    return str(path)


def process_upload(raw: bytes, upload_dir: str) -> tuple[str, str, Image.Image]:
    """Full pipeline: decode+strip EXIF, hash, store. Returns (path, phash, image)."""
    img = load_clean_image(raw)
    phash = perceptual_hash(img)
    path = save_image(img, upload_dir)
    return path, phash, img
