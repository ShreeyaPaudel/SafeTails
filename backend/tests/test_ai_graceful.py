"""AI components must degrade gracefully when the model / API key is absent."""
import io

from PIL import Image

from app.ml.gemini import GeminiService
from app.ml.species import SpeciesClassifier


def _img():
    return Image.new("RGB", (224, 224), (100, 100, 100))


def test_species_classifier_without_model_is_unverified():
    clf = SpeciesClassifier(model_path="ml/exported/__missing__.onnx", threshold=0.7)
    assert not clf.available
    pred = clf.predict(_img())
    assert pred.label == "Unverified"
    assert pred.model_available is False


def test_gemini_unavailable_returns_safe_defaults(monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "gemini_api_key", "", raising=False)
    svc = GeminiService()
    assert not svc.available

    buf = io.BytesIO()
    _img().save(buf, format="JPEG")
    jpeg = buf.getvalue()

    assert svc.assess_injury(jpeg)["status"] == "unknown"
    assert svc.content_safety(jpeg)["allowed"] is True  # never block on AI
    spam = svc.judge_spam({"reports_last_24h": 3})
    assert spam["spam_score"] == 0.0 and spam["available"] is False
