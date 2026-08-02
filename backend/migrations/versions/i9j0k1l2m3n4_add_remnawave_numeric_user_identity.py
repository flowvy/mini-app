"""Add the Remnawave 3.x numeric user identity.

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "i9j0k1l2m3n4"
down_revision: str | None = "h8i9j0k1l2m3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Store the stable numeric identity while retaining legacy UUIDs."""
    op.add_column(
        "subscriptions",
        sa.Column("remnawave_user_id", sa.BigInteger(), nullable=True),
    )
    op.create_index(
        "ix_subscriptions_remnawave_user_id",
        "subscriptions",
        ["remnawave_user_id"],
        unique=True,
    )


def downgrade() -> None:
    """Remove the numeric identity without touching legacy UUID data."""
    op.drop_index("ix_subscriptions_remnawave_user_id", table_name="subscriptions")
    op.drop_column("subscriptions", "remnawave_user_id")
