"""Dashboard aggregation service."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from pydantic import ValidationError
from redis.asyncio import Redis

from flowvy.schemas.dashboard import DashboardResponse, RemnawaveBandwidth, RemnawaveStats
from flowvy.services.bot_stats import BotStatsService
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError

logger = logging.getLogger(__name__)

CACHE_KEY = "dashboard:remnawave"
CACHE_TTL = 30


class DashboardService:
    """Aggregates Remnawave stats and bot stats into one response."""

    def __init__(
        self,
        remnawave: RemnawaveClient,
        bot_stats: BotStatsService,
        redis: Redis,
    ) -> None:
        self._remnawave = remnawave
        self._bot_stats = bot_stats
        self._redis = redis

    async def get_dashboard(self) -> DashboardResponse:
        """Fetch all dashboard data. Remnawave cached 30s."""
        rw_stats: dict[str, Any] | None = None
        rw_bw: dict[str, Any] | None = None

        cached = await self._redis.get(CACHE_KEY)
        if cached:
            try:
                rw_data = json.loads(cached)
                if not isinstance(rw_data, dict):
                    raise ValueError("dashboard cache is not an object")
                raw_stats = rw_data.get("stats")
                raw_bandwidth = rw_data.get("bandwidth")
                rw_stats = (
                    RemnawaveStats.model_validate(raw_stats).model_dump(by_alias=True)
                    if raw_stats is not None
                    else None
                )
                rw_bw = (
                    RemnawaveBandwidth.model_validate(raw_bandwidth).model_dump(by_alias=True)
                    if raw_bandwidth is not None
                    else None
                )
            except (json.JSONDecodeError, TypeError, ValueError, ValidationError):
                await self._redis.delete(CACHE_KEY)
                cached = None
        if not cached:
            rw_stats, rw_bw = await asyncio.gather(
                self._safe_remnawave(self._remnawave.get_system_stats),
                self._safe_remnawave(self._remnawave.get_bandwidth_stats),
            )
            payload = json.dumps({"stats": rw_stats, "bandwidth": rw_bw})
            await self._redis.set(CACHE_KEY, payload, ex=CACHE_TTL)

        bot = await self._bot_stats.collect()

        return DashboardResponse(
            remnawave_stats=rw_stats,
            remnawave_bandwidth=rw_bw,
            bot=bot,
        )

    @staticmethod
    async def _safe_remnawave(
        coro_fn: Any,
    ) -> dict[str, Any] | None:
        """Call a Remnawave method, return None on error."""
        try:
            return await coro_fn()
        except RemnawaveError:
            logger.warning("Remnawave call failed", exc_info=True)
            return None
