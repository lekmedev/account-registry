"""hello plugin migration: a tiny ping-log table proving per-plugin migrations run."""
revision = "hello_0001"
down_revision = None

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.create_table(
        "hello_ping_log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("hello_ping_log")
