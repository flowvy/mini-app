"""Add the observe-only Tribute webhook inbox.

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "n4o5p6q7r8s9"
down_revision: str | None = "m3n4o5p6q7r8"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Persist only normalized metadata from authenticated Tribute deliveries."""
    op.create_table(
        "tribute_webhook_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("delivery_key", sa.String(length=64), nullable=False),
        sa.Column("event_name", sa.String(length=100), nullable=False),
        sa.Column("event_family", sa.String(length=32), nullable=False),
        sa.Column("processing_status", sa.String(length=16), nullable=False),
        sa.Column(
            "provider_created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "provider_sent_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=True),
        sa.Column("transaction_id", sa.String(length=128), nullable=True),
        sa.Column("purchase_id", sa.String(length=128), nullable=True),
        sa.Column("external_item_id", sa.String(length=128), nullable=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("payment_mode", sa.String(length=16), nullable=True),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "delivery_key ~ '^[0-9a-f]{64}$'",
            name="ck_tribute_webhook_events_delivery_key",
        ),
        sa.CheckConstraint(
            "event_family IN ('donation', 'subscription', 'digital_product', 'other')",
            name="ck_tribute_webhook_events_family",
        ),
        sa.CheckConstraint(
            "processing_status IN ('observed', 'ignored')",
            name="ck_tribute_webhook_events_status",
        ),
        sa.CheckConstraint(
            "amount_minor IS NULL OR amount_minor >= 0",
            name="ck_tribute_webhook_events_amount",
        ),
        sa.CheckConstraint(
            "currency IS NULL OR currency ~ '^[A-Z]{3}$'",
            name="ck_tribute_webhook_events_currency",
        ),
        sa.CheckConstraint(
            "telegram_user_id IS NULL OR telegram_user_id > 0",
            name="ck_tribute_webhook_events_telegram_user",
        ),
        sa.CheckConstraint(
            "payment_mode IS NULL OR payment_mode IN ('one_time', 'recurring')",
            name="ck_tribute_webhook_events_payment_mode",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "delivery_key",
            name="uq_tribute_webhook_events_delivery_key",
        ),
    )
    op.create_index(
        "ix_tribute_webhook_events_status_received",
        "tribute_webhook_events",
        ["processing_status", "received_at"],
        unique=False,
    )
    op.create_index(
        "ix_tribute_webhook_events_telegram_user",
        "tribute_webhook_events",
        ["telegram_user_id", "received_at"],
        unique=False,
    )
    op.create_index(
        "ix_tribute_webhook_events_transaction",
        "tribute_webhook_events",
        ["transaction_id"],
        unique=False,
    )
    op.create_index(
        "ix_tribute_webhook_events_purchase",
        "tribute_webhook_events",
        ["purchase_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove only the observe-only inbox table."""
    op.drop_index(
        "ix_tribute_webhook_events_purchase",
        table_name="tribute_webhook_events",
    )
    op.drop_index(
        "ix_tribute_webhook_events_transaction",
        table_name="tribute_webhook_events",
    )
    op.drop_index(
        "ix_tribute_webhook_events_telegram_user",
        table_name="tribute_webhook_events",
    )
    op.drop_index(
        "ix_tribute_webhook_events_status_received",
        table_name="tribute_webhook_events",
    )
    op.drop_table("tribute_webhook_events")
