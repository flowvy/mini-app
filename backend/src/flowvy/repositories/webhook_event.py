"""Repository for webhook event persistence."""

from __future__ import annotations

import datetime

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from flowvy.models.webhook_event import WebhookEvent
from flowvy.repositories.base import BaseRepository


class WebhookEventRepository(BaseRepository[WebhookEvent]):
    """Stores incoming Remnawave webhook events."""

    model = WebhookEvent

    async def record_once(
        self,
        *,
        delivery_key: str,
        scope: str,
        event: str,
        timestamp: datetime.datetime,
    ) -> bool:
        """Atomically record a delivery; return false when it was seen before."""
        stmt = (
            insert(WebhookEvent)
            .values(
                delivery_key=delivery_key,
                scope=scope,
                event=event,
                timestamp=timestamp,
            )
            .on_conflict_do_nothing(
                constraint="uq_webhook_events_delivery_key",
            )
            .returning(WebhookEvent.id)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def delete_received_before(
        self,
        cutoff: datetime.datetime,
        *,
        batch_size: int,
    ) -> int:
        """Delete one bounded batch older than the retention boundary."""
        expired_ids = (
            select(WebhookEvent.id)
            .where(WebhookEvent.received_at < cutoff)
            .order_by(WebhookEvent.received_at, WebhookEvent.id)
            .limit(batch_size)
        )
        result = await self._session.execute(
            delete(WebhookEvent).where(WebhookEvent.id.in_(expired_ids)),
        )
        return result.rowcount or 0
