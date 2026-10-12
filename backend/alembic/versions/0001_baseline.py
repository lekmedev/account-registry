"""Phase 1 baseline: no tables yet (core tables land in Phase 2). Keeps `alembic upgrade head` green."""
revision = "0001_baseline"
down_revision = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
