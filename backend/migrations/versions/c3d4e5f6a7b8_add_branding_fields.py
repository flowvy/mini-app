"""Add branding fields to provider_settings.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-07

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add app_name and logo_url columns."""
    op.add_column(
        "provider_settings",
        sa.Column("app_name", sa.String(100), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column("logo_url", sa.String(512), nullable=True),
    )


def downgrade() -> None:
    """Remove app_name and logo_url columns."""
    op.drop_column("provider_settings", "logo_url")
    op.drop_column("provider_settings", "app_name")
