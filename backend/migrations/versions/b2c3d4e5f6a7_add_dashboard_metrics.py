"""Add last_active_at to users and bot_metrics_history table.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-07

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add last_active_at column and bot_metrics_history table."""
    op.add_column(
        "users",
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "bot_metrics_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "timestamp",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("total_users", sa.Integer(), nullable=False),
        sa.Column("active_users_1h", sa.Integer(), nullable=False),
        sa.Column("active_users_24h", sa.Integer(), nullable=False),
        sa.Column("api_requests_count", sa.Integer(), nullable=False),
    )
    op.create_index(
        "ix_bot_metrics_history_timestamp",
        "bot_metrics_history",
        ["timestamp"],
    )


def downgrade() -> None:
    """Remove bot_metrics_history table and last_active_at column."""
    op.drop_index("ix_bot_metrics_history_timestamp", "bot_metrics_history")
    op.drop_table("bot_metrics_history")
    op.drop_column("users", "last_active_at")
