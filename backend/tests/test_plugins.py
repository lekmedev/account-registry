"""Phase 3 tests: plugin loader + hello plugin.

Proves adding a folder under plugins/ is enough — core names no plugin.
Uses a throwaway Postgres schema; the real hello/ plugin dir is loaded.
"""
import json
import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://registry:registry_dev_only@localhost:5433/account_registry",
)

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
REPO_PLUGINS = REPO_ROOT / "plugins"
if not REPO_PLUGINS.is_dir():
    # container layout: /app/tests/... → repo root is /app, not /
    for cand in (REPO_ROOT / "app" / "plugins", Path("/app/plugins")):
        if cand.is_dir():
            REPO_PLUGINS = cand
            break

from app.core import auth, models  # noqa: E402
from app.core import plugin_loader  # noqa: E402
from app.core.db import Base, get_db  # noqa: E402

TEST_URL = os.environ["DATABASE_URL"]


@pytest.fixture(scope="module")
def plug_app():
    import plugins.hello.models  # noqa: F401 — registers nothing, proves import path
    schema = f"p_{uuid.uuid4().hex[:10]}"
    admin = create_engine(TEST_URL)
    with admin.connect() as c:
        c.execute(text(f"CREATE SCHEMA {schema}"))
        c.commit()
    url = f"{TEST_URL}?options=-csearch_path%3D{schema}"
    test_engine = create_engine(url)
    maker = sessionmaker(bind=test_engine)
    Base.metadata.create_all(test_engine)

    db = maker()
    db.add(models.Role(name="admin", description="Full access"))
    db.commit()
    admin_role = db.query(models.Role).filter_by(name="admin").one()
    db.add(models.User(
        username="admin", email="a@x.io",
        password_hash=auth.hash_password("Admin123!"), roles=[admin_role],
    ))
    db.commit()
    db.close()

    app = FastAPI()
    from app.core.routes import router as core_api_router
    app.include_router(core_api_router)

    def override():
        db = maker()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    loaded = plugin_loader.load_plugins(
        app, session_factory=maker, db_engine=test_engine,
        plugins_dir=REPO_PLUGINS,
    )
    assert "hello" in loaded  # the real hello plugin must load

    client = TestClient(app, raise_server_exceptions=False)
    yield client, maker, test_engine
    app.dependency_overrides.clear()
    plugin_loader.LOADED.clear()
    plugin_loader.SKIPPED.clear()
    plugin_loader._MOUNTED.clear()
    Base.metadata.drop_all(test_engine)
    with admin.connect() as c:
        c.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        c.commit()


def _login(client, username="admin", password="Admin123!"):
    r = client.post("/api/v1/core/auth/login",
                    json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    toks = r.json()
    return {"Authorization": f"Bearer {toks['access_token']}"}


def test_hello_ping_no_auth(plug_app):
    client, _, _ = plug_app
    r = client.get("/api/v1/plugins/hello/ping")
    assert r.status_code == 200
    assert r.json() == {"plugin": "hello", "message": "pong"}


def test_hello_whoami_needs_perm(plug_app):
    client, _, _ = plug_app
    assert client.get("/api/v1/plugins/hello/whoami").status_code == 401
    h = _login(client)
    r = client.get("/api/v1/plugins/hello/whoami", headers=h)
    assert r.status_code == 200  # admin has "*" → passes hello.view
    assert r.json()["username"] == "admin"


def test_plugins_list_and_menu(plug_app):
    client, _, _ = plug_app
    h = _login(client)
    r = client.get("/api/v1/core/plugins", headers=h)
    assert r.status_code == 200
    names = [p["name"] for p in r.json()]
    assert "hello" in names
    r = client.get("/api/v1/core/menu", headers=h)
    assert r.status_code == 200
    assert any(i["path"] == "/hello" for i in r.json())


def test_hello_migration_ran(plug_app):
    _, _, test_engine = plug_app
    with test_engine.connect() as c:
        tables = c.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = current_schema()"
        ))
        names = {row[0] for row in tables}
    assert "hello_ping_log" in names


def test_perm_upsert_idempotent(plug_app):
    client, maker, test_engine = plug_app
    h = _login(client)
    r = client.get("/api/v1/core/permissions", headers=h)
    assert "hello.view" in [p["code"] for p in r.json()]
    db = maker()
    n_before = db.query(models.Permission).count()
    db.close()
    # reload (fresh LOADED, keep _MOUNTED so the router isn't double-mounted):
    # permission rows must not duplicate and nothing is deleted
    plugin_loader.LOADED.clear()
    from app.main import app as _real_app  # noqa: F401
    plugin_loader.load_plugins(
        _real_app, session_factory=maker, db_engine=test_engine,
        plugins_dir=REPO_PLUGINS,
    )
    db = maker()
    n_after = db.query(models.Permission).count()
    codes = {p.code for p in db.query(models.Permission).all()}
    db.close()
    assert n_after == n_before
    assert "hello.view" in codes


def test_broken_plugin_skipped_app_starts(plug_app):
    client, maker, test_engine = plug_app
    tmp = Path(tempfile.mkdtemp())
    try:
        bad = tmp / "broken"
        bad.mkdir()
        (bad / "plugin.json").write_text(json.dumps({
            "name": "broken", "version": "1.0.0",
            "min_core_version": "1.0.0", "depends_on": [],
        }))
        (bad / "routes.py").write_text("raise RuntimeError('boom on import')\n")
        probe = FastAPI()
        loaded = plugin_loader.load_plugins(
            probe, session_factory=maker, db_engine=test_engine, plugins_dir=tmp,
        )
        assert "broken" not in loaded
        assert "broken" in plugin_loader.SKIPPED
        # the real app still serves the good plugin
        assert client.get("/api/v1/plugins/hello/ping").status_code == 200
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_version_gate_and_dep_order():
    assert plugin_loader._parse_version("1.0.0") < plugin_loader._parse_version("2.0.0")
    ordered, skipped = plugin_loader.resolve_order({
        "b": {"name": "b", "depends_on": ["a"]},
        "a": {"name": "a", "depends_on": []},
        "c": {"name": "c", "depends_on": ["ghost"]},
    })
    assert [m["name"] for m in ordered] == ["a", "b"]
    assert "c" in skipped
