"""Lightweight in-process rate limiting for sensitive endpoints (brute-force / abuse protection).

A fixed-window counter keyed by (bucket, client-ip). Zero dependencies and good enough for a
single-worker deployment; a multi-worker / multi-host deploy would swap the store for Redis.
Used as a FastAPI dependency: `Depends(RateLimit("login", limit=10, window_s=60))`.
"""
import threading
import time

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
_hits: dict[tuple[str, str], list[float]] = {}


def _client_ip(request: Request) -> str:
    # Honour a reverse proxy's forwarded header, else the direct peer.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimit:
    def __init__(self, bucket: str, limit: int, window_s: int = 60) -> None:
        self.bucket = bucket
        self.limit = limit
        self.window_s = window_s

    def __call__(self, request: Request) -> None:
        now = time.monotonic()
        key = (self.bucket, _client_ip(request))
        with _lock:
            hits = [t for t in _hits.get(key, []) if now - t < self.window_s]
            if len(hits) >= self.limit:
                retry = int(self.window_s - (now - hits[0])) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many attempts. Please wait a moment and try again.",
                    headers={"Retry-After": str(max(retry, 1))},
                )
            hits.append(now)
            _hits[key] = hits
            # opportunistic cleanup so the dict doesn't grow unbounded
            if len(_hits) > 5000:
                for k in [k for k, v in _hits.items() if all(now - t >= self.window_s for t in v)]:
                    _hits.pop(k, None)
