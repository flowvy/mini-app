"""Webhook event log ORM model."""

from __future__ import annotations

import datetime

from sqlalchemy import DateTime, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base


class WebhookEvent(Base):
    """Minimal Remnawave metadata for audit and replay suppression."""

    __tablename__ = "webhook_events"
    __table_args__ = (
        UniqueConstraint(
            "delivery_key",
            name="uq_webhook_events_delivery_key",
        ),
        Index("ix_webhook_events_scope_event", "scope", "event"),
        Index("ix_webhook_events_received_at", "received_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    delivery_key: Mapped[str] = mapped_column(String(64))
    scope: Mapped[str] = mapped_column(String(50))
    event: Mapped[str] = mapped_column(String(100))
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    def __repr__(self) -> str:
        """Return dev-friendly representation."""
        return f"<WebhookEvent id={self.id} event={self.event}>"
