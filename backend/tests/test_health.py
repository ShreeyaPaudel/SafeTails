"""Smoke test: the app boots and /health responds. Run: pytest from /backend."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_openapi_contract_present():
    """All contracted route groups should appear in the OpenAPI schema."""
    schema = client.get("/openapi.json").json()
    paths = schema["paths"]
    for expected in ["/auth/register", "/reports", "/map/markers", "/leaderboard", "/feed"]:
        assert expected in paths, f"missing contract path {expected}"
