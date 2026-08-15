"""Restore UUID defaults for sponsor offers and checkouts.

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-08-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "w3x4y5z6a7b8"
down_revision: str | Sequence[str] | None = "v2w3x4y5z6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Match the migrated tables to the shared ORM UUID primary-key contract."""
    for table_name in ("sponsor_offers", "sponsor_checkouts"):
        op.alter_column(
            table_name,
            "id",
            existing_type=postgresql.UUID(as_uuid=True),
            existing_nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        )


def downgrade() -> None:
    """Return to the prior schema without changing existing UUID values."""
    for table_name in ("sponsor_checkouts", "sponsor_offers"):
        op.alter_column(
            table_name,
            "id",
            existing_type=postgresql.UUID(as_uuid=True),
            existing_nullable=False,
            server_default=None,
        )
