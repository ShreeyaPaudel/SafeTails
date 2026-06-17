"""Cloudinary image hosting. Degrades gracefully: if Cloudinary isn't configured or a call
fails, callers fall back to local /uploads serving so the app still works offline."""
from __future__ import annotations

from functools import lru_cache

from app.core.config import settings


@lru_cache(maxsize=1)
def _configured() -> bool:
    if not (settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret):
        return False
    try:
        import cloudinary

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,
        )
        return True
    except Exception:
        return False


def upload_image(data: bytes, folder: str = "safetails", public_id: str | None = None) -> str | None:
    """Upload image bytes to Cloudinary; return the secure URL, or None if unavailable/failed."""
    if not _configured():
        return None
    try:
        import cloudinary.uploader

        res = cloudinary.uploader.upload(
            data, folder=folder, public_id=public_id, overwrite=True, resource_type="image"
        )
        return res.get("secure_url")
    except Exception:
        return None
