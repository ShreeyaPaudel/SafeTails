"""Central application configuration, loaded from environment / `.env`.

Reproducibility: `SEED = 42` is fixed here and re-exported for all components.
Secrets are never hardcoded - they come from the environment (see `.env.example`).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SEED: int = 42  # global fixed seed (master spec - do not change)
BASE_DIR = Path(__file__).resolve().parents[3]  # repo root (…/backend/app/core/config.py)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    # Database
    database_url: str = "postgresql+psycopg2://stray:stray@localhost:5432/stray"
    # Schemas searched for the PostGIS `geometry` type. Supabase installs PostGIS into a
    # dedicated schema (here `gis`) that is not on the default search_path, so we add it.
    db_search_path: str = "public,extensions,gis"

    # Auth
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    # Google Sign-In. Empty -> the /auth/google endpoint reports "not configured" (graceful).
    google_client_id: str = ""

    # CORS: comma-separated frontend origins allowed to call the API.
    allowed_origins: str = "http://localhost:3000,http://localhost:3001"

    # Password reset. Base URL used to build the emailed reset link (frontend origin).
    app_base_url: str = "http://localhost:3000"
    password_reset_ttl_minutes: int = 15
    # SMTP for sending reset emails. If unset, the reset endpoint runs in DEV mode and returns
    # the token/OTP in the response so the flow is testable without an email provider.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "SafeTails <no-reply@safetails.app>"

    # Gemini
    gemini_api_key: str = ""
    # Google retires model ids on a rolling basis (2.5-flash, then 2.0-flash, both -> 404).
    # `gemini-flash-latest` is an alias that tracks the current flash model, so it survives a
    # retirement; the fallbacks below are tried in order if the preferred id ever stops
    # resolving, which keeps injury assessment working instead of degrading to "unknown".
    # Free-tier request quotas are per model and per day, and the newest models carry the
    # smallest allowance (gemini-3.7-flash is 20/day), so the preferred id is a stable "lite"
    # model with a generous allowance rather than a "latest" alias that chases the newest one.
    # If a model 404s (retired) or exhausts its own daily quota, the service fails over to the
    # next id in this list, which keeps injury assessment working instead of degrading to
    # "unknown" for the rest of the day.
    gemini_model: str = "gemini-flash-lite-latest"
    gemini_model_fallbacks: str = (
        "gemini-2.5-flash-lite,gemini-3.5-flash,gemini-3.6-flash,gemini-2.5-flash"
    )

    # Cloudinary (image hosting). Empty -> fall back to local /uploads serving.
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # ML inference
    species_model_path: str = "ml/exported/species_model.onnx"
    species_confidence_threshold: float = 0.70
    # Above this the classifier is accepted outright; between the two thresholds its answer is
    # put to the hosted model for a second opinion. Taken from the measured risk-coverage curve
    # on the held-out split (ml/refit_calibration.py): accuracy of accepted labels is 97.3% at
    # 0.70 but 99.6% at 0.86, so the band in between is exactly where the classifier is
    # confident and still wrong often enough to be worth checking. Costs roughly one extra call
    # per twenty-five reports.
    species_trust_threshold: float = 0.86
    # Temperature-scaling calibration (Guo et al. 2017), fit on the val split by NLL.
    # T*=0.30 sharpens an under-confident model; ECE 0.357 -> 0.035 on test. See
    # ml/exported/calibration.json. Temperature is argmax-invariant (accuracy unchanged).
    species_temperature: float = 0.26  # refitted for the deployed preprocessing (see ml/refit_calibration.py)

    # App
    seed: int = SEED
    upload_dir: str = "backend/uploads"
    max_upload_mb: int = 10
    location_grid_meters: int = 100

    version: str = "0.1.0"

    @property
    def gemini_model_fallback_list(self) -> list[str]:
        """Fallback model ids, in the order they should be tried."""
        return [m.strip() for m in self.gemini_model_fallbacks.split(",") if m.strip()]

    @property
    def upload_path(self) -> str:
        """Absolute upload dir, anchored to the repo root so it's CWD-independent."""
        p = Path(self.upload_dir)
        return str(p if p.is_absolute() else BASE_DIR / p)

    @property
    def species_model_abs_path(self) -> str:
        """Absolute path to the ONNX model, anchored to the repo root (CWD-independent)."""
        p = Path(self.species_model_path)
        return str(p if p.is_absolute() else BASE_DIR / p)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
