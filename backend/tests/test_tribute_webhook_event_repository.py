"""PostgreSQL idempotency and retention tests for the Tribute inbox."""

from __future__ import annotations

import asyncio
import datetime
from dataclasses import asdict

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.models.tribute_webhook_event import TributeWebhookEvent
from flowvy.repositories.tribute_webhook_event import TributeWebhookEventRepository
from flowvy.schemas.tribute_webhooks import TributeWebhookInboxInput
from flowvy.services.webhook_retention import delete_expired_webhook_events


def _event(
    delivery_key: str,
    timestamp: datetime.datetime,
    *,
    event_name: str = "new_donation",
    telegram_user_id: int = 123,
    payment_mode: str = "one_time",
) -> TributeWebhookInboxInput:
    return TributeWebhookInboxInput(
        delivery_key=delivery_key,
        event_name=event_name,
        event_family="donation",
        processing_status="observed",
        provider_created_at=timestamp,
        provider_sent_at=timestamp,
        provider_expires_at=None,
        is_anonymous=None,
        telegram_user_id=telegram_user_id,
        external_item_id=None,
        amount_minor=50000,
        currency="RUB",
        payment_mode=payment_mode,
        provider_period="monthly" if payment_mode == "recurring" else None,
    )


@pytest.mark.asyncio
async def test_delivery_key_is_atomic_and_payload_free(session: AsyncSession) -> None:
    repo = TributeWebhookEventRepository(session)
    timestamp = datetime.datetime.now(datetime.UTC)

    first = await repo.record_once(_event("a" * 64, timestamp))
    second = await repo.record_once(_event("a" * 64, timestamp))

    assert first is not None
    assert second is None
    stored = await session.scalar(select(TributeWebhookEvent))
    assert stored is not None
    assert stored.delivery_key == "a" * 64
    assert not hasattr(stored, "payload")
    assert not hasattr(stored, "signature")


@pytest.mark.asyncio
async def test_two_concurrent_deliveries_record_exactly_once(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    timestamp = datetime.datetime.now(datetime.UTC)

    async def record() -> bool:
        async with factory() as session:
            created = await TributeWebhookEventRepository(session).record_once(
                _event("b" * 64, timestamp),
            )
            await session.commit()
            return created is not None

    first, second = await asyncio.gather(record(), record())

    assert sorted((first, second)) == [False, True]
    async with factory() as session:
        count = await session.scalar(select(func.count()).select_from(TributeWebhookEvent))
    assert count == 1


@pytest.mark.asyncio
async def test_recurring_donation_queries_ignore_one_time_and_other_users(
    session: AsyncSession,
) -> None:
    repo = TributeWebhookEventRepository(session)
    now = datetime.datetime.now(datetime.UTC)
    payment = await repo.record_once(
        _event("e" * 64, now, payment_mode="recurring"),
    )
    cancellation = await repo.record_once(
        _event(
            "f" * 64,
            now + datetime.timedelta(seconds=1),
            event_name="cancelled_donation",
            payment_mode="recurring",
        ),
    )
    await repo.record_once(
        _event("1" * 64, now + datetime.timedelta(seconds=2)),
    )
    await repo.record_once(
        _event(
            "2" * 64,
            now + datetime.timedelta(seconds=3),
            telegram_user_id=456,
            payment_mode="recurring",
        ),
    )

    latest = await repo.latest_recurring_donation_for_user(123)
    latest_payment = await repo.latest_recurring_donation_payment_for_user(123)

    assert latest is not None and latest.id == cancellation.id
    assert latest_payment is not None and latest_payment.id == payment.id


@pytest.mark.asyncio
async def test_retention_uses_the_tribute_specific_window(engine: AsyncEngine) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.datetime.now(datetime.UTC)
    async with factory() as session:
        session.add_all(
            [
                TributeWebhookEvent(
                    **asdict(_event("c" * 64, now - datetime.timedelta(days=100))),
                    received_at=now - datetime.timedelta(days=100),
                ),
                TributeWebhookEvent(
                    **asdict(_event("d" * 64, now)),
                    received_at=now,
                ),
            ],
        )
        await session.commit()

    deleted = await delete_expired_webhook_events(
        factory,
        30,
        90,
        batch_size=100,
        now=now,
    )

    async with factory() as session:
        events = list((await session.scalars(select(TributeWebhookEvent))).all())
    assert deleted == 1
    assert [event.delivery_key for event in events] == ["d" * 64]
