"""Shared pytest fixtures: throwaway Postgres schema + app with plugins loaded.

Core tests use this directly. A plugin ships its own `plugins/<name>/tests/`
and imports what it needs:

    from tests.conftest import app_factory, login  # noqa: F401

so that adding a plugin never means editing a file under backend/.
"""
import os
import sys
import uuid
from pathlib import Path

import pytest

# Must be set before app.core.config reads it.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://registry:registry_dev_only@localhost:5433/account_registry",
)

BACKEND = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND.parent
# Repo root: `import plugins.<name>.…`. Backend: `import app.…`.
for _p in (str(REPO_ROOT), str(BACKEND)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

REPO_PLUGINS = REPO_ROOT / "plugins"
if not REPO_PLUGINS.is_dir():
    # container layout: tests live in /app/tests → plugins mount at /app/plugins
    for _cand in (REPO_ROOT / "app" / "plugins", Path("/app/plugins")):
        if _cand.is_dir():
            REPO_PLUGINS = _cand
            break

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core import auth, models  # noqa: E402
from app.core import plugin_loader  # noqa: E402
from app.core.db import Base, get_db  # noqa: E402

TEST_URL = os.environ["DATABASE_URL"]


@pytest.fixture(scope="module")
def app_factory():
    """build(*required_plugin_names) -> (client, sessionmaker, engine).

    Creates an isolated schema, seeds one admin, mounts the core router and
    runs every real plugin's migrations into that schema. Torn down with the
    module that requested it.
    """
    built: list = []

    def build(*required: str):
        schema = f"t_{uuid.uuid4().hex[:10]}"
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
        for name in required:
            assert name in loaded, f"{name} not loaded: {plugin_loader.SKIPPED}"

        client = TestClient(app, raise_server_exceptions=False)

        def cleanup():
            app.dependency_overrides.clear()
            plugin_loader.LOADED.clear()
            plugin_loader.SKIPPED.clear()
            plugin_loader._MOUNTED.clear()
            Base.metadata.drop_all(test_engine)
            with admin.connect() as c:
                c.execute(text(f"DROP SCHEMA {schema} CASCADE"))
                c.commit()
            admin.dispose()

        built.append(cleanup)
        return client, maker, test_engine

    yield build
    for fn in reversed(built):
        fn()


def login(client, username: str = "admin", password: str = "Admin123!") -> dict:
    """Log in and return the Authorization header. Asserts 200."""
    r = client.post(
        "/api/v1/core/auth/login",
        json={"username": username, "password": password},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}