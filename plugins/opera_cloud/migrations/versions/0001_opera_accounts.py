"""opera_cloud migration: local opera_accounts registry table."""
revision = "opera_0001"
down_revision = None

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    if "opera_accounts" in sa.inspect(op.get_bind()).get_table_names():
        return  # already created (e.g. tests' create_all); keep idempotent
    op.create_table(
        "opera_accounts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String(64), unique=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("employee_name", sa.String(128), nullable=False),
        sa.Column("employee_id", sa.String(64), nullable=False),
        sa.Column("department_id", sa.Integer,
                  sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("position_id", sa.Integer,
                  sa.ForeignKey("positions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("operator_code", sa.String(64), unique=True, nullable=False),
        sa.Column("roles", postgresql.JSONB,
                  server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("privileges", postgresql.JSONB,
                  server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("account_status", sa.String(16),
                  server_default="active", nullable=False),
        sa.Column("expiration_date", sa.Date, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_by", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("opera_accounts")
