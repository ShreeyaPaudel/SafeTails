"""EXIF stripping + perceptual hashing (anti-spam dedup guard) behaviour."""
import io

import imagehash
import pytest
from PIL import Image, ImageDraw

from app.utils.images import (
    InvalidImageError,
    load_clean_image,
    perceptual_hash,
    process_upload,
    to_jpeg_bytes,
)


def _png_bytes(seed=0) -> bytes:
    """A structured image (perceptual hashing is degenerate on flat/solid images)."""
    img = Image.new("RGB", (256, 256), (120, 200, 80))
    d = ImageDraw.Draw(img)
    for i in range(6):
        x = (seed * 17 + i * 40) % 220
        d.rectangle([x, x, x + 30, x + 30 + seed * 5], fill=(20 * i, 255 - 20 * i, seed * 30 % 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_load_clean_image_rejects_garbage():
    with pytest.raises(InvalidImageError):
        load_clean_image(b"not-an-image")


def test_saved_image_has_no_exif(tmp_path):
    path, phash, _ = process_upload(_png_bytes(), str(tmp_path))
    with Image.open(path) as reloaded:
        assert dict(reloaded.getexif()) == {}  # metadata stripped
    assert isinstance(phash, str) and len(phash) > 0


def test_phash_close_across_reencode():
    # The dedup guard compares pHash with a Hamming-distance threshold (~5), not equality -
    # JPEG re-encoding flips a couple of bits but the same photo stays well within threshold.
    raw = _png_bytes()
    h1 = imagehash.hex_to_hash(perceptual_hash(load_clean_image(raw)))
    h2 = imagehash.hex_to_hash(perceptual_hash(load_clean_image(to_jpeg_bytes(load_clean_image(raw)))))
    assert (h1 - h2) <= 5


def test_different_images_differ():
    h1 = perceptual_hash(load_clean_image(_png_bytes(seed=1)))
    h2 = perceptual_hash(load_clean_image(_png_bytes(seed=9)))
    assert h1 != h2
