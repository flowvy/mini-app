"""Add welcome template fields to provider_settings.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-09

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add welcome_text, welcome_media_url, welcome_media_type, welcome_button_text."""
    op.add_column(
        "provider_settings",
        sa.Column("welcome_text", sa.String(2000), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column("welcome_media_url", sa.String(512), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column("welcome_media_type", sa.String(20), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column("welcome_button_text", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    """Remove welcome template columns."""
    op.drop_column("provider_settings", "welcome_button_text")
    op.drop_column("provider_settings", "welcome_media_type")
    op.drop_column("provider_settings", "welcome_media_url")
    op.drop_column("provider_settings", "welcome_text")
