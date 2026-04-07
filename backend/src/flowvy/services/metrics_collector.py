"""Background task: periodic metrics snapshot and last_seen flush."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from flowvy.models.bot_metrics import BotMetricsHistory
from flowvy.models.user import User

logger = logging.getLogger(__name__)


async def run_metrics_collector(
    redis: Redis,
    sessionmaker: async_sessionmaker[AsyncSession],
    interval_seconds: int,
) -> None:
    """Run metrics collection loop until cancelled.

    Every ``interval_seconds``:
    1. Flush ``bot:last_seen`` from Redis to ``users.last_active_at``.
    2. Insert a snapshot row into ``bot_metrics_history``.
    """
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            async with sessionmaker() as session:
                await _flush_last_seen(session, redis)
                await _record_metrics(session, redis)
                await session.commit()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Metrics collector tick failed")


async def _flush_last_seen(session: AsyncSession, redis: Redis) -> None:
    """Move bot:last_seen hash from Redis into users.last_active_at."""
    data = await redis.hgetall("bot:last_seen")
    if not data:
        return

    for tid_bytes, ts_bytes in data.items():
        telegram_id = int(tid_bytes)
        last_seen = datetime.fromtimestamp(int(ts_bytes), tz=UTC)
        await session.execute(
            update(User).where(User.id == telegram_id).values(last_active_at=last_seen),
        )

    await redis.delete("bot:last_seen")


async def _record_metrics(session: AsyncSession, redis: Redis) -> None:
    """Insert a snapshot of current metrics into bot_metrics_history."""
    now = datetime.now(UTC)

    total_users = (
        await session.scalar(
            select(func.count()).select_from(User),
        )
        or 0
    )

    active_1h = (
        await session.scalar(
            select(func.count())
            .select_from(User)
            .where(User.last_active_at >= now - timedelta(hours=1)),
        )
        or 0
    )

    active_24h = (
        await session.scalar(
            select(func.count())
            .select_from(User)
            .where(User.last_active_at >= now - timedelta(hours=24)),
        )
        or 0
    )

    requests_total = int(await redis.get("bot:requests:total") or 0)

    session.add(
        BotMetricsHistory(
            total_users=total_users,
            active_users_1h=active_1h,
            active_users_24h=active_24h,
            api_requests_count=requests_total,
        ),
    )
