"""Short-lived server-side cache of pre-submit AI assessments.

The submit flow (POST /reports) used to re-run every AI step (content-safety, species,
injury) even though the client had just called POST /reports/assess on the very same image
seconds earlier. That doubled the slowest part of the request (2-3 network calls to Gemini).

`/assess` now stores its result here keyed by the image's content hash, and `create_report`
reuses it when the same bytes are submitted shortly after. The AI stays authoritative on the
server (we key by the uploaded bytes, not by anything the client sends), and the common
"assess then submit" path skips redundant model calls entirely.

Kept deliberately tiny: an in-process dict with a TTL and a hard size cap. Single-worker dev
is the target; a multi-worker deploy would simply miss the cache and recompute (still correct).
"""
from __future__ import annotations

import hashlib
import threading
from time import monotonic

_TTL_SECONDS = 600  # assessments are reused only for ~10 min after they're produced
_MAX_ENTRIES = 256

_lock = threading.Lock()
_store: dict[str, tuple[float, dict]] = {}


def content_key(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _evict_locked(now: float) -> None:
    # Drop expired entries; if still over cap, drop the oldest.
    expired = [k for k, (ts, _) in _store.items() if now - ts > _TTL_SECONDS]
    for k in expired:
        _store.pop(k, None)
    if len(_store) > _MAX_ENTRIES:
        for k in sorted(_store, key=lambda k: _store[k][0])[: len(_store) - _MAX_ENTRIES]:
            _store.pop(k, None)


def put(data: bytes, assessment: dict) -> None:
    now = monotonic()
    with _lock:
        _evict_locked(now)
        _store[content_key(data)] = (now, assessment)


def get(data: bytes) -> dict | None:
    now = monotonic()
    with _lock:
        entry = _store.get(content_key(data))
        if entry is None:
            return None
        ts, value = entry
        if now - ts > _TTL_SECONDS:
            _store.pop(content_key(data), None)
            return None
        return value
