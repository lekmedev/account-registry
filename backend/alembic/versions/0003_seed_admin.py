"""Seed admin role + admin user. Rerunnable: skips if admin user exists."""
revision = "0003_seed_admin"
down_revision = "0002_core_tables"

import os

import bcrypt
from alembic import op
import sqlalchemy as sa

ADMIN_USER = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASSWORD", "Admin123!")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@localhost")


def upgrade() -> None:
    conn = op.get_bind()
    existing = conn.execute(sa.text("SELECT id FROM users WHERE username=:u"), {"u": ADMIN_USER}).first()
    if existing:
        return
    pw = bcrypt.hashpw(ADMIN_PASS.encode(), bcrypt.gensalt()).decode()
    conn.execute(
        sa.text("INSERT INTO roles (name, description) VALUES ('admin', 'Full access')"),
    )
    role_id = conn.execute(sa.text("SELECT id FROM roles WHERE name='admin'")).scalar()
    conn.execute(
        sa.text(
            "INSERT INTO users (username, email, password_hash, is_active) "
            "VALUES (:u, :e, :p, true)"
        ),
        {"u": ADMIN_USER, "e": ADMIN_EMAIL, "p": pw},
    )
    user_id = conn.execute(
        sa.text("SELECT id FROM users WHERE username=:u"), {"u": ADMIN_USER}
    ).scalar()
    conn.execute(
        sa.text("INSERT INTO user_roles (user_id, role_id) VALUES (:uid, :rid)"),
        {"uid": user_id, "rid": role_id},
    )


def downgrade() -> None:
    conn = op.get_bind()
    uid = conn.execute(
        sa.text("SELECT id FROM users WHERE username=:u"), {"u": ADMIN_USER}
    ).scalar()
    if uid:
        conn.execute(sa.text("DELETE FROM user_roles WHERE user_id=:uid"), {"uid": uid})
        conn.execute(sa.text("DELETE FROM users WHERE id=:uid"), {"uid": uid})
