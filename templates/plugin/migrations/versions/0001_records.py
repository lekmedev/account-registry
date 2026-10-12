"""{{LABEL}} migration: the {{TABLE}} registry table."""
revision = "{{name}}_0001"
down_revision = None

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    if "{{TABLE}}" in sa.inspect(op.get_bind()).get_table_names():
        return  # already created (e.g. tests' create_all); keep idempotent
    op.create_table(
        "{{TABLE}}",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(64), unique=True, nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("department_id", sa.Integer,
                  sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tags", postgresql.JSONB,
                  server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("status", sa.String(16), server_default="active", nullable=False),
        sa.Column("expiration_date", sa.Date, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_by", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("{{TABLE}}")