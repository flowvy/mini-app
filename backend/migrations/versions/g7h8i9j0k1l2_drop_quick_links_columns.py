"""Drop support_url and renew_url from provider_settings.

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-04-11

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g7h8i9j0k1l2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Remove quick links columns."""
    op.drop_column("provider_settings", "support_url")
    op.drop_column("provider_settings", "renew_url")


def downgrade() -> None:
    """Re-add quick links columns."""
    op.add_column(
        "provider_settings",
        sa.Column("support_url", sa.String(512), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column("renew_url", sa.String(512), nullable=True),
    )
