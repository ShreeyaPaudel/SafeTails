"""Central Gemini service - every non-species AI capability goes through here.

Capabilities: injury assessment, edge-case species, anti-spam/abuse judgment, content-safety
pre-filter, and dashboard insights. Each method:
  * uses a strict prompt that asks for parseable JSON,
  * parses defensively, and
  * DEGRADES GRACEFULLY on any failure / missing API key (never raises into a request).

If `GEMINI_API_KEY` is unset, the service is "unavailable" and every method returns a safe
default (injury -> "unknown", spam -> deterministic-only, content-safety -> allow).
"""
from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


def classify_error(exc: Exception) -> str:
    """Turn a raw SDK exception into a short, user-facing reason (never leak internals)."""
    name = type(exc).__name__.lower()
    s = str(exc).lower()
    if "resourceexhausted" in name or "429" in s or "quota" in s or "rate limit" in s:
        return "AI rate limit / quota reached. Please wait a moment and try again."
    if "permissiondenied" in name or "unauthenticated" in name or "api key" in s or "api_key" in s \
            or "invalid" in s and "key" in s or "401" in s or "403" in s:
        return "AI key is invalid or unauthorized."
    if "deadline" in name or "timeout" in s or "timed out" in s:
        return "AI request timed out. Please try again."
    if "serviceunavailable" in name or "unavailable" in s or "503" in s or "connection" in s or "network" in s:
        return "AI service is temporarily unavailable."
    if "notfound" in name or "404" in s:
        return "AI model not found / unavailable."
    return "AI analysis failed. Please try again."


def _strip_json(text: str) -> str:
    """Pull a JSON object out of a model response that may be fenced in ```json blocks."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1] if t.count("```") >= 2 else t.strip("`")
        if t.startswith("json"):
            t = t[4:]
    start, end = t.find("{"), t.rfind("}")
    return t[start : end + 1] if start != -1 and end != -1 else t


# When a quota/rate-limit error is seen, stop calling the API for this long so subsequent
# requests degrade instantly instead of each one hanging on the SDK's internal 429 back-off.
_QUOTA_COOLDOWN_SECONDS = 60.0
# After any give-up (timeout, network, unavailable) we also pause live calls briefly. A
# single submission makes up to three AI calls; without this a slow network multiplied one
# 20 s timeout into a minute-long request, so the first failure now short-circuits the rest
# and the submission completes promptly on its degraded path.
_FAILURE_COOLDOWN_SECONDS = 20.0
# Hard per-call ceiling so a single request can never block the whole submit for long.
_REQUEST_TIMEOUT_SECONDS = 45.0  # measured: a cold call needs ~15-25s; 20s cut off healthy calls


def _is_model_missing(exc: Exception) -> bool:
    """True when the configured model id no longer resolves (retired, renamed, or not granted).

    Google retires model ids on a rolling basis. When that happens every call 404s and every
    AI-derived field silently degrades to "unknown", so this is detected explicitly and
    answered by failing over to the next candidate rather than by surfacing an error.
    """
    name = type(exc).__name__.lower()
    s = str(exc).lower()
    return "notfound" in name or "404" in s or "is not found" in s or "no longer available" in s


def _is_quota_error(exc: Exception) -> bool:
    name = type(exc).__name__.lower()
    s = str(exc).lower()
    return "resourceexhausted" in name or "429" in s or "quota" in s or "rate limit" in s


class GeminiService:
    def __init__(self) -> None:
        self._model = None
        self._genai = None
        self._candidates: list[str] = []
        self._cooldown_until = 0.0  # monotonic() timestamp; >now means "skip live calls"
        if settings.gemini_api_key:
            try:
                import google.generativeai as genai

                genai.configure(api_key=settings.gemini_api_key)
                self._genai = genai
                # Preferred id first, then documented fallbacks. Duplicates removed, order kept.
                seen: set[str] = set()
                for name in [settings.gemini_model, *settings.gemini_model_fallback_list]:
                    if name and name not in seen:
                        seen.add(name)
                        self._candidates.append(name)
                self._model = genai.GenerativeModel(self._candidates[0])
                self._active = self._candidates[0]
                self._warm_async()
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Gemini init failed: %s", exc)
                self._model = None

    def _warm_async(self) -> None:
        """Open the connection in the background so the first real request is not paying for it.

        A cold call carries TLS and channel setup on top of inference: measured here at roughly
        20-25 s cold against ~15 s warm. Since a submission makes several calls in sequence, a
        cold first call could exceed the timeout, trip the failure cooldown, and starve the
        species and injury calls that actually matter. Warming at start-up removes that.
        """

        def _warm() -> None:
            try:
                self._model.generate_content(
                    "ok", request_options={"timeout": _REQUEST_TIMEOUT_SECONDS}
                )
            except Exception:  # noqa: BLE001 - best effort only, never surfaced
                pass

        threading.Thread(target=_warm, daemon=True).start()

    def _try_next_model(self) -> bool:
        """Advance to the next candidate model id. False when the chain is exhausted."""
        if self._genai is None or not self._candidates:
            return False
        try:
            idx = self._candidates.index(self._active)
        except ValueError:
            idx = 0
        if idx + 1 >= len(self._candidates):
            return False
        self._active = self._candidates[idx + 1]
        self._model = self._genai.GenerativeModel(self._active)
        logger.warning("Gemini model failed over to %s", self._active)
        return True

    @property
    def available(self) -> bool:
        return self._model is not None

    def _in_cooldown(self) -> bool:
        """True while a recent quota error has us short-circuiting live calls."""
        return time.monotonic() < self._cooldown_until

    # -- low-level call ------------------------------------------------------
    def _call_text(self, parts: list[Any], retries: int = 1) -> tuple[str | None, str | None]:
        """Return (text, error_reason). Fails fast on quota (circuit breaker) so a degraded AI
        never slows the request; retries only genuine transient network blips."""
        if self._model is None:
            return None, "AI service is not configured."
        # Circuit breaker: after a quota error, skip the network entirely for a cooldown window.
        if self._in_cooldown():
            return None, "AI service is temporarily unavailable. Please try again shortly."
        last_exc: Exception | None = None
        # +len(candidates) so a fail-over does not consume the transient-retry budget
        for attempt in range(retries + 1 + len(self._candidates)):
            try:
                resp = self._model.generate_content(
                    parts, request_options={"timeout": _REQUEST_TIMEOUT_SECONDS}
                )
                return resp.text, None
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if _is_quota_error(exc):
                    # Free-tier quotas are counted per model, so an exhausted allowance on one
                    # id says nothing about the next. Try the rest of the chain before giving
                    # up; only when every candidate is spent do we trip the breaker, because
                    # at that point a daily quota genuinely will not clear within the request.
                    if self._try_next_model():
                        continue
                    self._cooldown_until = time.monotonic() + _QUOTA_COOLDOWN_SECONDS
                    break
                if _is_model_missing(exc) and self._try_next_model():
                    # A retired/unavailable id is permanent, not transient: switch and retry
                    # immediately rather than burning the retry budget on the dead model.
                    continue
                name = type(exc).__name__.lower()
                s = str(exc).lower()
                transient = ("unavailable" in s or "503" in s or "deadline" in name
                             or "timeout" in s or "timed out" in s)
                if transient and attempt < retries:
                    time.sleep(1.0)
                    continue
                break
        # Bound the damage a slow or unreachable endpoint can do to the rest of this request.
        if last_exc is not None and not _is_quota_error(last_exc):
            self._cooldown_until = max(
                self._cooldown_until, time.monotonic() + _FAILURE_COOLDOWN_SECONDS
            )
        logger.warning("Gemini call failed: %s", last_exc)
        return None, classify_error(last_exc) if last_exc else "AI analysis failed."

    def _generate_json(self, parts: list[Any]) -> dict | None:
        text, _ = self._call_text(parts)
        if text is None:
            return None
        try:
            return json.loads(_strip_json(text))
        except Exception:  # noqa: BLE001
            return None

    # -- capabilities --------------------------------------------------------
    def assess_injury(self, image_bytes: bytes, species: str | None = None) -> dict:
        """Binary injured/not-injured. Always returns a dict; on failure includes an `error`
        reason (so the caller can surface it) and status 'unknown' (never raises).

        `species` is the label from the in-house classifier. Passing it keeps the rationale
        consistent with the final classification (never "the dog ..." on a cow)."""
        unknown = {"status": "unknown", "injured": None, "confidence": None, "rationale": None, "severity_hint": None}
        animal = species.lower() if species and species not in ("Unverified", "Other") else "animal"
        prompt = (
            "You are a veterinary triage assistant for an animal-welfare app. The animal in this "
            f"photo has already been identified as a {animal}; refer to it ONLY as \"{animal}\" "
            "(or \"the animal\") in your rationale, never as any other species. Carefully examine "
            "it for signs of INJURY or acute distress: visible wounds, bleeding, swelling, a "
            "clearly broken/dragging/raised limb, inability to stand, severe lameness, or obvious "
            "pain. A healthy, calm, standing or sitting animal with no visible wounds is NOT "
            "injured. Do not guess injury from a normal pose, dirt, or background alone. "
            "Respond ONLY with strict JSON: "
            '{"injured": true|false, "confidence": 0.0-1.0, '
            '"rationale": "one short factual sentence about what you see", '
            '"severity_hint": "mild|moderate|severe|null"}.'
        )
        text, error = self._call_text([prompt, {"mime_type": "image/jpeg", "data": image_bytes}], retries=1)
        if error:
            return {**unknown, "error": error}
        try:
            data = json.loads(_strip_json(text))
        except Exception:  # noqa: BLE001
            return {**unknown, "error": "Could not parse the AI response."}
        if "injured" not in data:
            return {**unknown, "error": "AI returned an unexpected response."}
        return {
            "status": "injured" if data.get("injured") else "not_injured",
            "injured": bool(data.get("injured")),
            "confidence": data.get("confidence"),
            "rationale": data.get("rationale"),
            "severity_hint": data.get("severity_hint"),
            "error": None,
        }

    def species_second_opinion(self, image_bytes: bytes) -> dict | None:
        """Constrained edge-case species label when the CNN is Unverified. AI estimate only."""
        prompt = (
            "Classify the main animal into exactly one of: Dog, Cat, Cow, Buffalo, Other. "
            "If no clear animal, use Other. Respond ONLY with JSON: "
            '{"label": "Dog|Cat|Cow|Buffalo|Other", "free_text_guess": "short", "confidence": 0-1}.'
        )
        return self._generate_json([prompt, {"mime_type": "image/jpeg", "data": image_bytes}])

    def content_safety(self, image_bytes: bytes) -> dict:
        """Pre-filter clearly inappropriate uploads. On failure -> allow (do not block)."""
        prompt = (
            "Is this image appropriate for an animal-welfare reporting app (i.e. it shows an "
            "animal or a street/urban scene, and is NOT pornographic, gory-of-humans, or abusive "
            "content unrelated to animals)? Respond ONLY with JSON: "
            '{"allowed": true|false, "reason": "short"}.'
        )
        data = self._generate_json([prompt, {"mime_type": "image/jpeg", "data": image_bytes}])
        if not data or "allowed" not in data:
            return {"allowed": True, "reason": "safety check unavailable"}
        return {"allowed": bool(data["allowed"]), "reason": data.get("reason", "")}

    def judge_spam(self, summary: dict) -> dict:
        """Anti-spam/abuse judgment from a PII-free behavioural summary.

        On failure -> not suspicious (deterministic guards still apply upstream)."""
        prompt = (
            "You are a moderation assistant for a community animal-reporting app. Given this "
            "PII-FREE behavioural summary of a user and their latest report, judge spam/abuse "
            "risk. Respond ONLY with JSON: "
            '{"is_suspicious": true|false, "spam_score": 0-1, "reasons": ["short", ...]}.\n'
            f"Summary: {json.dumps(summary)}"
        )
        data = self._generate_json([prompt])
        if not data or "spam_score" not in data:
            return {"is_suspicious": False, "spam_score": 0.0, "reasons": [], "available": False}
        return {
            "is_suspicious": bool(data.get("is_suspicious")),
            "spam_score": float(data.get("spam_score", 0.0)),
            "reasons": data.get("reasons", []),
            "available": True,
        }

    def narrate(self, prompt: str, stats: dict) -> str | None:
        """Dashboard insight narration (clearly labelled AI-generated upstream)."""
        if self._model is None or self._in_cooldown():
            return None
        try:
            resp = self._model.generate_content(
                f"{prompt}\nData (do not invent beyond this): {json.dumps(stats)}\n"
                "Write 1-2 plain sentences. No markdown.",
                request_options={"timeout": _REQUEST_TIMEOUT_SECONDS},
            )
            return resp.text.strip()
        except Exception as exc:
            if _is_quota_error(exc):
                self._cooldown_until = time.monotonic() + _QUOTA_COOLDOWN_SECONDS
            logger.warning("Gemini narrate failed: %s", exc)
            return None


_service: GeminiService | None = None


def get_gemini() -> GeminiService:
    global _service
    if _service is None:
        _service = GeminiService()
    return _service
