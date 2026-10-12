"""Phase 1 smoke tests: health endpoints only (no DB needed; db shows down without Postgres)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_health_shape():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "core_version" in body
    assert "db" in body


def test_api_health_alias():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_core_health():
    r = client.get("/api/v1/core/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
