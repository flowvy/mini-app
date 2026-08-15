"""Observe-only Tribute webhook inbox ORM model."""

from __future__ import annotations

import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base


class TributeWebhookEvent(Base):
    """Minimal normalized metadata; raw payloads and signatures are never persisted."""

    __tablename__ = "tribute_webhook_events"
    __table_args__ = (
        UniqueConstraint(
            "delivery_key",
            name="uq_tribute_webhook_events_delivery_key",
        ),
        CheckConstraint(
            "delivery_key ~ '^[0-9a-f]{64}$'",
            name="ck_tribute_webhook_events_delivery_key",
        ),
        CheckConstraint(
            "event_family IN ('donation', 'subscription', 'other')",
            name="ck_tribute_webhook_events_family",
        ),
        CheckConstraint(
            "processing_status IN ('observed', 'ignored')",
            name="ck_tribute_webhook_events_status",
        ),
        CheckConstraint(
            "amount_minor IS NULL OR amount_minor >= 0",
            name="ck_tribute_webhook_events_amount",
        ),
        CheckConstraint(
            "currency IS NULL OR currency ~ '^[A-Z]{3}$'",
            name="ck_tribute_webhook_events_currency",
        ),
        CheckConstraint(
            "telegram_user_id IS NULL OR telegram_user_id > 0",
            name="ck_tribute_webhook_events_telegram_user",
        ),
        CheckConstraint(
            "payment_mode IS NULL OR payment_mode IN ('one_time', 'recurring')",
            name="ck_tribute_webhook_events_payment_mode",
        ),
        CheckConstraint(
            "provider_period IS NULL OR provider_period IN "
            "('weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly')",
            name="ck_tribute_webhook_events_provider_period",
        ),
        CheckConstraint(
            "subscription_type IS NULL OR subscription_type IN ('regular', 'gift', 'trial')",
            name="ck_tribute_webhook_events_subscription_type",
        ),
        Index(
            "ix_tribute_webhook_events_status_received",
            "processing_status",
            "received_at",
        ),
        Index(
            "ix_tribute_webhook_events_telegram_user",
            "telegram_user_id",
            "received_at",
        ),
        Index(
            "ix_tribute_webhook_events_transaction",
            "transaction_id",
        ),
        Index(
            "ix_tribute_webhook_events_provider_reference",
            "provider_reference_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    delivery_key: Mapped[str] = mapped_column(String(64))
    event_name: Mapped[str] = mapped_column(String(100))
    event_family: Mapped[str] = mapped_column(String(32))
    processing_status: Mapped[str] = mapped_column(String(16))
    provider_created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
    )
    provider_sent_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
    )
    provider_expires_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
    )
    is_anonymous: Mapped[bool | None] = mapped_column(Boolean)
    telegram_user_id: Mapped[int | None] = mapped_column(BigInteger)
    transaction_id: Mapped[str | None] = mapped_column(String(128))
    provider_reference_id: Mapped[str | None] = mapped_column(String(128))
    external_item_id: Mapped[str | None] = mapped_column(String(128))
    amount_minor: Mapped[int | None] = mapped_column(BigInteger)
    currency: Mapped[str | None] = mapped_column(String(3))
    payment_mode: Mapped[str | None] = mapped_column(String(16))
    provider_period: Mapped[str | None] = mapped_column(String(16), nullable=True)
    subscription_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    received_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    def __repr__(self) -> str:
        """Return a payload-free developer representation."""
        return f"<TributeWebhookEvent id={self.id} event={self.event_name}>"
