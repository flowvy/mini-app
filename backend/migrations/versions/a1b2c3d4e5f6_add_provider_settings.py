"""Add provider_settings table.

Revision ID: a1b2c3d4e5f6
Revises: ecb3341ce3fe
Create Date: 2026-04-05

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "ecb3341ce3fe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create provider_settings and insert singleton row."""
    op.create_table(
        "provider_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "kuma_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("kuma_url", sa.String(512), nullable=True),
        sa.Column("kuma_slug", sa.String(255), nullable=True),
        sa.Column("support_url", sa.String(512), nullable=True),
        sa.Column("renew_url", sa.String(512), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.execute("INSERT INTO provider_settings (id, kuma_enabled) VALUES (1, false)")


def downgrade() -> None:
    """Drop provider_settings table."""
    op.drop_table("provider_settings")
