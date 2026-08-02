"""Harden webhook event idempotency, privacy, and timestamps.

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-08-02

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "h8i9j0k1l2m3"
down_revision: str | None = "g7h8i9j0k1l2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add replay protection, redact legacy payloads, and use aware timestamps."""
    op.add_column(
        "webhook_events",
        sa.Column("delivery_key", sa.String(length=64), nullable=True),
    )
    op.execute(
        "UPDATE webhook_events "
        "SET delivery_key = 'legacy:' || lpad(id::text, 57, '0') "
        "WHERE delivery_key IS NULL",
    )
    op.alter_column("webhook_events", "delivery_key", nullable=False)
    op.create_unique_constraint(
        "uq_webhook_events_delivery_key",
        "webhook_events",
        ["delivery_key"],
    )
    op.alter_column(
        "webhook_events",
        "timestamp",
        type_=sa.DateTime(timezone=True),
        postgresql_using="timestamp AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "webhook_events",
        "received_at",
        type_=sa.DateTime(timezone=True),
        postgresql_using="received_at AT TIME ZONE 'UTC'",
    )
    op.drop_column("webhook_events", "data")


def downgrade() -> None:
    """Restore the legacy shape with empty payloads; removed secrets stay removed."""
    op.add_column(
        "webhook_events",
        sa.Column(
            "data",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )
    op.alter_column("webhook_events", "data", server_default=None)
    op.alter_column(
        "webhook_events",
        "received_at",
        type_=sa.DateTime(timezone=False),
        postgresql_using="received_at AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "webhook_events",
        "timestamp",
        type_=sa.DateTime(timezone=False),
        postgresql_using="timestamp AT TIME ZONE 'UTC'",
    )
    op.drop_constraint(
        "uq_webhook_events_delivery_key",
        "webhook_events",
        type_="unique",
    )
    op.drop_column("webhook_events", "delivery_key")
