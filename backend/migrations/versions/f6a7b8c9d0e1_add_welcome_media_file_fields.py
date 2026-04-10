"""Add welcome_media_file_id and welcome_media_file_name to provider_settings.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-10

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add welcome_media_file_id and welcome_media_file_name."""
    op.add_column(
        "provider_settings",
        sa.Column("welcome_media_file_id", sa.Text(), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column("welcome_media_file_name", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    """Remove welcome media file columns."""
    op.drop_column("provider_settings", "welcome_media_file_name")
    op.drop_column("provider_settings", "welcome_media_file_id")
