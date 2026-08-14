"""Persistence for the observe-only Tribute webhook inbox."""

from __future__ import annotations

import datetime

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from flowvy.models.tribute_webhook_event import TributeWebhookEvent
from flowvy.repositories.base import BaseRepository
from flowvy.schemas.tribute_webhooks import TributeWebhookInboxInput


class TributeWebhookEventRepository(BaseRepository[TributeWebhookEvent]):
    """Atomically stores minimal authenticated Tribute delivery metadata."""

    model = TributeWebhookEvent

    async def record_once(
        self,
        event: TributeWebhookInboxInput,
    ) -> TributeWebhookEvent | None:
        """Insert one exact delivery, returning none for a replay."""
        stmt = (
            insert(TributeWebhookEvent)
            .values(
                delivery_key=event.delivery_key,
                event_name=event.event_name,
                event_family=event.event_family,
                processing_status=event.processing_status,
                provider_created_at=event.provider_created_at,
                provider_sent_at=event.provider_sent_at,
                telegram_user_id=event.telegram_user_id,
                transaction_id=event.transaction_id,
                purchase_id=event.purchase_id,
                external_item_id=event.external_item_id,
                amount_minor=event.amount_minor,
                currency=event.currency,
                payment_mode=event.payment_mode,
            )
            .on_conflict_do_nothing(
                constraint="uq_tribute_webhook_events_delivery_key",
            )
            .returning(TributeWebhookEvent)
        )
        result = await self._session.execute(stmt)
        return result.scalars().one_or_none()

    async def delete_received_before(
        self,
        cutoff: datetime.datetime,
        *,
        batch_size: int,
    ) -> int:
        """Delete one bounded batch older than the retention boundary."""
        expired_ids = (
            select(TributeWebhookEvent.id)
            .where(TributeWebhookEvent.received_at < cutoff)
            .order_by(TributeWebhookEvent.received_at, TributeWebhookEvent.id)
            .limit(batch_size)
        )
        result = await self._session.execute(
            delete(TributeWebhookEvent).where(TributeWebhookEvent.id.in_(expired_ids)),
        )
        return result.rowcount or 0
