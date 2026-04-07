"""Add webhook_events table.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-07

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create webhook_events table with indexes."""
    op.create_table(
        "webhook_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("scope", sa.String(50), nullable=False),
        sa.Column("event", sa.String(100), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_webhook_events_scope_event",
        "webhook_events",
        ["scope", "event"],
    )
    op.create_index(
        "ix_webhook_events_received_at",
        "webhook_events",
        ["received_at"],
    )


def downgrade() -> None:
    """Drop webhook_events table and indexes."""
    op.drop_index("ix_webhook_events_received_at", "webhook_events")
    op.drop_index("ix_webhook_events_scope_event", "webhook_events")
    op.drop_table("webhook_events")
