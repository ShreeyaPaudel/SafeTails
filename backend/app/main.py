"""FastAPI application entrypoint.

Boots the API, mounts the (contract-stub) router tree, and exposes a health check.
Live OpenAPI docs at /docs, schema at /openapi.json.
"""
from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import api_router
from app.core.config import settings

logger = logging.getLogger("safetails")

app = FastAPI(
    title="Stray Animal Community Platform API",
    version=settings.version,
    description=(
        "Gamified AI-supported geo-spatial reporting for stray, lost, and other animals in "
        "urban Kathmandu. One in-house model (species CNN); all other AI via Gemini."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Security headers on every response (cheap hardening; the API serves JSON, not HTML).
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("Permissions-Policy", "geolocation=(self)")
        return resp


app.add_middleware(SecurityHeadersMiddleware)


# Never leak a stack trace: log the real error, return a clean 500. (HTTPExceptions pass through
# FastAPI's own handler untouched, so 4xx messages stay intact.)
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "An unexpected error occurred. Please try again."})


app.include_router(api_router)

# Serve uploaded (EXIF-stripped) report images at /uploads/<filename>.
os.makedirs(settings.upload_path, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_path), name="uploads")


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "version": settings.version}
