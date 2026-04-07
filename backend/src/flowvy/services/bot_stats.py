"""Bot-level statistics service."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import psutil
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.models.user import User
from flowvy.schemas.dashboard import (
    BotRequestStats,
    BotStatsResponse,
    BotSystemStats,
    BotUserStats,
)

APP_START_TIME: float = time.time()


class BotStatsService:
    """Collects bot system, user, and request metrics."""

    def __init__(
        self,
        session: AsyncSession,
        redis: Redis,
        version: str,
    ) -> None:
        self._session = session
        self._redis = redis
        self._version = version

    async def collect(self) -> BotStatsResponse:
        """Gather all bot metrics and return aggregated response."""
        system = self._collect_system()
        users = await self._collect_users()
        requests = await self._collect_requests()
        return BotStatsResponse(system=system, users=users, requests=requests)

    def _collect_system(self) -> BotSystemStats:
        """Collect host system metrics via psutil."""
        mem = psutil.virtual_memory()
        return BotSystemStats(
            cpu_cores=psutil.cpu_count(logical=True) or 1,
            memory_total=mem.total,
            memory_used=mem.used,
            memory_percent=mem.percent,
            uptime_seconds=time.time() - APP_START_TIME,
            version=self._version,
        )

    async def _collect_users(self) -> BotUserStats:
        """Count users by activity window from DB."""
        now = datetime.now(UTC).replace(tzinfo=None)

        total = (
            await self._session.scalar(
                select(func.count()).select_from(User),
            )
            or 0
        )

        new_today = (
            await self._session.scalar(
                select(func.count())
                .select_from(User)
                .where(User.created_at >= now - timedelta(days=1)),
            )
            or 0
        )

        new_this_week = (
            await self._session.scalar(
                select(func.count())
                .select_from(User)
                .where(User.created_at >= now - timedelta(weeks=1)),
            )
            or 0
        )

        active_1h = (
            await self._session.scalar(
                select(func.count())
                .select_from(User)
                .where(User.last_active_at >= now - timedelta(hours=1)),
            )
            or 0
        )

        active_24h = (
            await self._session.scalar(
                select(func.count())
                .select_from(User)
                .where(User.last_active_at >= now - timedelta(hours=24)),
            )
            or 0
        )

        return BotUserStats(
            total_users=total,
            new_today=new_today,
            new_this_week=new_this_week,
            active_1h=active_1h,
            active_24h=active_24h,
        )

    async def _collect_requests(self) -> BotRequestStats:
        """Read request counters from Redis."""
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        total = int(await self._redis.get("bot:requests:total") or 0)
        today_count = int(await self._redis.get(f"bot:requests:{today}") or 0)
        return BotRequestStats(total_requests=total, today_requests=today_count)
