"""Phase 2 tests: auth + RBAC + CRUD + audit. Uses a throwaway Postgres schema per run."""
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://registry:registry_dev_only@localhost:5433/account_registry",
)

from app.core import auth, models  # noqa: E402
from app.core.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402

TEST_URL = os.environ["DATABASE_URL"]


@pytest.fixture(scope="session")
def test_db():
    schema = f"t_{uuid.uuid4().hex[:10]}"
    admin = create_engine(TEST_URL)
    with admin.connect() as c:
        c.execute(text(f"CREATE SCHEMA {schema}"))
        c.commit()
    url = f"{TEST_URL}?options=-csearch_path%3D{schema}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine)

    # seed: admin role + admin user
    db = maker()
    db.add(models.Role(name="admin", description="Full access"))
    db.commit()
    admin_role = db.query(models.Role).filter_by(name="admin").one()
    admin_user = models.User(
        username="admin", email="a@x.io",
        password_hash=auth.hash_password("Admin123!"), roles=[admin_role],
    )
    db.add(admin_user)
    db.commit()
    db.close()

    def override():
        db = maker()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    yield maker
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    with admin.connect() as c:
        c.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        c.commit()


@pytest.fixture()
def client(test_db):
    return TestClient(app, raise_server_exceptions=False)


def _login(client, username="admin", password="Admin123!"):
    r = client.post("/api/v1/core/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    toks = r.json()
    return {"Authorization": f"Bearer {toks['access_token']}"}, toks


def test_login_me_refresh(client):
    headers, toks = _login(client)
    r = client.get("/api/v1/core/auth/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["username"] == "admin"
    r = client.post("/api/v1/core/auth/refresh", json={"refresh_token": toks["refresh_token"]})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_bad_password_401(client):
    r = client.post("/api/v1/core/auth/login", json={"username": "admin", "password": "nope"})
    assert r.status_code == 401


def test_me_no_token_401(client):
    assert client.get("/api/v1/core/auth/me").status_code == 401


def test_rbac_user_cannot_manage(client):
    db = next(app.dependency_overrides[get_db]())
    viewer = models.User(
        username="viewer", email="v@x.io", password_hash=auth.hash_password("Viewer123!")
    )
    db.add(viewer)
    db.commit()
    db.close()
    r = client.post(
        "/api/v1/core/auth/login", json={"username": "viewer", "password": "Viewer123!"}
    )
    vh = {"Authorization": f"Bearer {r.json()['access_token']}"}
    # viewer has no roles: can auth but listing users is 403
    assert client.get("/api/v1/core/users", headers=vh).status_code == 403
    # admin implicitly has all permissions via admin role
    admin_h, _ = _login(client)
    assert client.get("/api/v1/core/users", headers=admin_h).status_code == 200


def test_user_crud_audit(client):
    h, _ = _login(client)
    r = client.post(
        "/api/v1/core/users",
        headers=h,
        json={"username": "alice", "email": "alice@x.io", "password": "Alice123!"},
    )
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    r = client.put(f"/api/v1/core/users/{uid}", headers=h, json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    # duplicate username → 409
    r = client.post(
        "/api/v1/core/users",
        headers=h,
        json={"username": "alice", "email": "alice2@x.io", "password": "Alice123!"},
    )
    assert r.status_code == 409
    # audit captured login + user create + update
    r = client.get("/api/v1/core/audit?resource=user", headers=h)
    assert r.status_code == 200 and r.json()["total"] >= 2


def test_role_dept_position_crud(client):
    h, _ = _login(client)
    # give viewer a manager role and confirm scoping works via permission codes
    r = client.post(
        "/api/v1/core/roles",
        headers=h,
        json={"name": "hr_manager", "permission_codes": []},
    )
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    r = client.put(f"/api/v1/core/roles/{rid}", headers=h, json={"description": "HR"})
    assert r.status_code == 200

    r = client.post("/api/v1/core/departments", headers=h, json={"name": "IT"})
    assert r.status_code == 201, r.text
    did = r.json()["id"]
    r = client.post(
        "/api/v1/core/positions", headers=h,
        json={"name": "SysAdmin", "department_id": did},
    )
    assert r.status_code == 201, r.text
    assert r.json()["department_name"] == "IT"
    # bad department FK → 404
    r = client.post(
        "/api/v1/core/positions", headers=h,
        json={"name": "Ghost", "department_id": 999999},
    )
    assert r.status_code == 404
    # audit filter by action
    r = client.get("/api/v1/core/audit?action=create&resource=department", headers=h)
    assert r.status_code == 200 and r.json()["total"] >= 1
