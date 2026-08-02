"""PostgreSQL-backed replay and retention tests for webhook event metadata."""

from __future__ import annotations

import asyncio
import datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.models.webhook_event import WebhookEvent
from flowvy.repositories.webhook_event import WebhookEventRepository
from flowvy.services.webhook_retention import delete_expired_webhook_events


@pytest.mark.asyncio
async def test_delivery_key_is_atomic_and_idempotent(session: AsyncSession) -> None:
    repo = WebhookEventRepository(session)
    timestamp = datetime.datetime.now(datetime.UTC)

    first = await repo.record_once(
        delivery_key="a" * 64,
        scope="user",
        event="user.modified",
        timestamp=timestamp,
    )
    second = await repo.record_once(
        delivery_key="a" * 64,
        scope="user",
        event="user.modified",
        timestamp=timestamp,
    )

    assert first is True
    assert second is False
    assert await session.scalar(select(func.count()).select_from(WebhookEvent)) == 1


@pytest.mark.asyncio
async def test_retention_deletes_only_expired_metadata(engine: AsyncEngine) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.datetime.now(datetime.UTC)
    async with factory() as session:
        session.add_all(
            [
                WebhookEvent(
                    delivery_key="a" * 64,
                    scope="user",
                    event="user.modified",
                    timestamp=now - datetime.timedelta(days=40),
                    received_at=now - datetime.timedelta(days=40),
                ),
                WebhookEvent(
                    delivery_key="b" * 64,
                    scope="node",
                    event="node.modified",
                    timestamp=now,
                    received_at=now,
                ),
            ],
        )
        await session.commit()

    deleted = await delete_expired_webhook_events(
        factory,
        30,
        batch_size=100,
        now=now,
    )

    async with factory() as session:
        events = list((await session.scalars(select(WebhookEvent))).all())
    assert deleted == 1
    assert [event.delivery_key for event in events] == ["b" * 64]


@pytest.mark.asyncio
async def test_two_concurrent_deliveries_record_exactly_once(engine: AsyncEngine) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    timestamp = datetime.datetime.now(datetime.UTC)

    async def record() -> bool:
        async with factory() as session:
            created = await WebhookEventRepository(session).record_once(
                delivery_key="c" * 64,
                scope="user",
                event="user.modified",
                timestamp=timestamp,
            )
            await session.commit()
            return created

    first, second = await asyncio.gather(record(), record())

    assert sorted((first, second)) == [False, True]
    async with factory() as session:
        assert await session.scalar(select(func.count()).select_from(WebhookEvent)) == 1
