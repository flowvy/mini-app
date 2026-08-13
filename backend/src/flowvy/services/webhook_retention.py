"""Periodic retention for minimal Remnawave webhook event metadata."""

from __future__ import annotations

import asyncio
import datetime
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from flowvy.repositories.tribute_webhook_event import TributeWebhookEventRepository
from flowvy.repositories.webhook_event import WebhookEventRepository

logger = logging.getLogger(__name__)


async def delete_expired_webhook_events(
    session_factory: async_sessionmaker[AsyncSession],
    remnawave_retention_days: int,
    tribute_retention_days: int | None = None,
    *,
    batch_size: int,
    now: datetime.datetime | None = None,
) -> int:
    """Delete one bounded batch of expired metadata in a committed transaction."""
    reference = now or datetime.datetime.now(datetime.UTC)
    remnawave_cutoff = reference - datetime.timedelta(days=remnawave_retention_days)
    tribute_cutoff = reference - datetime.timedelta(
        days=tribute_retention_days or remnawave_retention_days,
    )
    async with session_factory() as session:
        remnawave_deleted = await WebhookEventRepository(session).delete_received_before(
            remnawave_cutoff,
            batch_size=batch_size,
        )
        tribute_deleted = await TributeWebhookEventRepository(
            session,
        ).delete_received_before(
            tribute_cutoff,
            batch_size=batch_size,
        )
        await session.commit()
    return remnawave_deleted + tribute_deleted


async def run_webhook_retention(
    session_factory: async_sessionmaker[AsyncSession],
    remnawave_retention_days: int,
    tribute_retention_days: int,
    interval_seconds: int,
    batch_size: int,
) -> None:
    """Prune expired rows at startup and periodically without stopping the app."""
    while True:
        try:
            total_deleted = 0
            for _ in range(10):
                deleted = await delete_expired_webhook_events(
                    session_factory,
                    remnawave_retention_days,
                    tribute_retention_days,
                    batch_size=batch_size,
                )
                total_deleted += deleted
                if deleted < batch_size:
                    break
            if total_deleted:
                logger.info("Deleted %d expired webhook event rows", total_deleted)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Webhook retention cleanup failed")
        await asyncio.sleep(interval_seconds)
