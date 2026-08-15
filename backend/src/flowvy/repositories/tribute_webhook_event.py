"""Persistence for the observe-only Tribute webhook inbox."""

from __future__ import annotations

import datetime

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.sql.elements import ColumnElement

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
                provider_expires_at=event.provider_expires_at,
                is_anonymous=event.is_anonymous,
                telegram_user_id=event.telegram_user_id,
                external_item_id=event.external_item_id,
                amount_minor=event.amount_minor,
                currency=event.currency,
                payment_mode=event.payment_mode,
                provider_period=event.provider_period,
                subscription_type=event.subscription_type,
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

    async def latest_subscription_for_user(
        self,
        telegram_user_id: int,
    ) -> TributeWebhookEvent | None:
        """Return the latest normalized Creator subscription lifecycle event."""
        return await self._latest_for_user(
            telegram_user_id,
            TributeWebhookEvent.event_family == "subscription",
        )

    async def latest_recurring_donation_for_user(
        self,
        telegram_user_id: int,
    ) -> TributeWebhookEvent | None:
        """Return the latest recurring-donation payment or cancellation event."""
        return await self._latest_for_user(
            telegram_user_id,
            TributeWebhookEvent.event_family == "donation",
            TributeWebhookEvent.payment_mode == "recurring",
        )

    async def latest_recurring_donation_payment_for_user(
        self,
        telegram_user_id: int,
    ) -> TributeWebhookEvent | None:
        """Return the latest recurring-donation event that actually carried payment."""
        return await self._latest_for_user(
            telegram_user_id,
            TributeWebhookEvent.event_family == "donation",
            TributeWebhookEvent.payment_mode == "recurring",
            TributeWebhookEvent.event_name.in_(("new_donation", "recurrent_donation")),
        )

    async def _latest_for_user(
        self,
        telegram_user_id: int,
        *filters: ColumnElement[bool],
    ) -> TributeWebhookEvent | None:
        stmt = (
            select(TributeWebhookEvent)
            .where(
                TributeWebhookEvent.telegram_user_id == telegram_user_id,
                *filters,
            )
            .order_by(
                TributeWebhookEvent.provider_created_at.desc(),
                TributeWebhookEvent.received_at.desc(),
            )
            .limit(1)
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()
