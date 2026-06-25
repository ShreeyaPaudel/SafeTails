"""Species inference via the in-house ONNX model (the ONLY trained model).

Loads the exported ONNX species classifier and returns a calibrated prediction. Degrades
gracefully: if the model file isn't present yet (it's produced in Phase 2), predictions are
returned as `Unverified` so the rest of the pipeline (and Gemini fallback) still works.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

from app.core.config import settings

_FALLBACK_CLASS_NAMES = ["Dog", "Cat", "Cow", "Buffalo", "Other"]


def _load_class_names() -> list[str]:
    """Class order from the exported labels file, falling back to the built-in order.

    The order must match the model's output columns exactly, so reading it from the artefact
    keeps the two in step if the model is ever retrained with a different class set.
    """
    try:
        labels_path = Path(settings.species_model_abs_path).with_name("labels.json")
        if labels_path.exists():
            names = json.loads(labels_path.read_text(encoding="utf-8"))
            if isinstance(names, list) and names and all(isinstance(n, str) for n in names):
                return names
    except Exception:  # noqa: BLE001 - never let label loading break inference
        pass
    return list(_FALLBACK_CLASS_NAMES)


CLASS_NAMES = _load_class_names()
_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
_IMG_SIZE = 224
_RESIZE_SHORT = 256  # short side before the centre crop (standard eval transform)


@dataclass
class SpeciesPrediction:
    label: str
    confidence: float | None
    all_class_probs: dict[str, float]
    source: str = "cnn"
    model_available: bool = True


def _preprocess(img: Image.Image) -> np.ndarray:
    """Aspect-preserving resize to the short side, then a centre crop.

    Squashing straight to a square distorts anything that is not already square, and phone
    photos are overwhelmingly tall portrait frames: a 1536x2730 photo stretched to 224x224 is
    widened by about 78%, which is enough to turn a standing dog into something the model reads
    as a cow or buffalo. Training used RandomResizedCrop, i.e. aspect-preserving crops, so a
    centre crop is also the closer match to what the network actually learned.

    Bilinear matches the torchvision resize default used by the training pipeline.
    """
    img = img.convert("RGB")
    w, h = img.size
    scale = _RESIZE_SHORT / min(w, h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BILINEAR)
    w, h = img.size
    left, top = (w - _IMG_SIZE) // 2, (h - _IMG_SIZE) // 2
    img = img.crop((left, top, left + _IMG_SIZE, top + _IMG_SIZE))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - _IMAGENET_MEAN) / _IMAGENET_STD
    arr = arr.transpose(2, 0, 1)[None, ...]  # NCHW
    return arr.astype(np.float32)


def _softmax(x: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    x = x / temperature
    e = np.exp(x - x.max())
    return e / e.sum()


class SpeciesClassifier:
    def __init__(self, model_path: str, threshold: float, temperature: float = 1.0):
        self.threshold = threshold
        self.temperature = temperature
        self._session = None
        path = Path(model_path)
        if path.exists():
            try:
                import onnxruntime as ort

                self._session = ort.InferenceSession(
                    str(path), providers=["CPUExecutionProvider"]
                )
                self._input_name = self._session.get_inputs()[0].name
            except Exception:  # pragma: no cover - defensive
                self._session = None

    @property
    def available(self) -> bool:
        return self._session is not None

    def predict(self, img: Image.Image) -> SpeciesPrediction:
        if self._session is None:
            return SpeciesPrediction(
                label="Unverified",
                confidence=None,
                all_class_probs={},
                source="cnn",
                model_available=False,
            )
        logits = self._session.run(None, {self._input_name: _preprocess(img)})[0][0]
        probs = _softmax(np.asarray(logits, dtype=np.float32), self.temperature)
        idx = int(probs.argmax())
        conf = float(probs[idx])
        label = CLASS_NAMES[idx] if conf >= self.threshold else "Unverified"
        return SpeciesPrediction(
            label=label,
            confidence=conf,
            all_class_probs={c: float(p) for c, p in zip(CLASS_NAMES, probs)},
        )


@lru_cache(maxsize=1)
def get_classifier() -> SpeciesClassifier:
    return SpeciesClassifier(
        settings.species_model_abs_path,
        settings.species_confidence_threshold,
        getattr(settings, "species_temperature", 1.0),
    )


def image_cache_key(raw: bytes) -> str:
    """Stable key for caching predictions by image content."""
    return hashlib.sha256(raw).hexdigest()
