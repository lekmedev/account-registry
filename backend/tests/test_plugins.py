"""Phase 3 tests: plugin loader + hello plugin.

Proves adding a folder under plugins/ is enough — core names no plugin.
Uses a throwaway Postgres schema (see conftest.app_factory); the real hello/
plugin dir is loaded.
"""
import json
import shutil
import tempfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from sqlalchemy import text

from app.core import models
from app.core import plugin_loader

from .conftest import REPO_PLUGINS, login


@pytest.fixture(scope="module")
def plug_app(app_factory):
    import plugins.hello.models  # noqa: F401 — registers nothing, proves import path
    return app_factory("hello")


def test_hello_ping_no_auth(plug_app):
    client, _, _ = plug_app
    r = client.get("/api/v1/plugins/hello/ping")
    assert r.status_code == 200
    assert r.json() == {"plugin": "hello", "message": "pong"}


def test_hello_whoami_needs_perm(plug_app):
    client, _, _ = plug_app
    assert client.get("/api/v1/plugins/hello/whoami").status_code == 401
    h = login(client)
    r = client.get("/api/v1/plugins/hello/whoami", headers=h)
    assert r.status_code == 200  # admin has "*" → passes hello.view
    assert r.json()["username"] == "admin"


def test_plugins_list_and_menu(plug_app):
    client, _, _ = plug_app
    h = login(client)
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
    h = login(client)
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