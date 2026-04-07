"""Webhook event log ORM model."""

from __future__ import annotations

import datetime

from sqlalchemy import JSON, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base


class WebhookEvent(Base):
    """Persisted Remnawave webhook event for audit and replay."""

    __tablename__ = "webhook_events"
    __table_args__ = (
        Index("ix_webhook_events_scope_event", "scope", "event"),
        Index("ix_webhook_events_received_at", "received_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    scope: Mapped[str] = mapped_column(String(50))
    event: Mapped[str] = mapped_column(String(100))
    timestamp: Mapped[datetime.datetime]
    data: Mapped[dict] = mapped_column(JSON)
    received_at: Mapped[datetime.datetime] = mapped_column(
        server_default=func.now(),
    )

    def __repr__(self) -> str:
        """Return dev-friendly representation."""
        return f"<WebhookEvent id={self.id} event={self.event}>"
