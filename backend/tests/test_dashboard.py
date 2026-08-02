"""Dashboard provider projection and cache recovery tests."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from flowvy.schemas.dashboard import (
    BotRequestStats,
    BotStatsResponse,
    BotSystemStats,
    BotUserStats,
)
from flowvy.services.dashboard import CACHE_KEY, DashboardService

SYSTEM_STATS = {
    "cpu": {"cores": 4},
    "memory": {"total": 100, "free": 40, "used": 60},
    "uptime": 3600,
    "timestamp": 1_754_131_200,
    "users": {"statusCounts": {"ACTIVE": 2}, "totalUsers": 2},
    "onlineStats": {"lastDay": 2, "lastWeek": 2, "neverOnline": 0, "onlineNow": 1},
    "nodes": {"totalOnline": 1, "totalBytesLifetime": "12345"},
}
BANDWIDTH = {
    key: {"current": "10", "previous": "9", "difference": "+1"}
    for key in (
        "bandwidthLastTwoDays",
        "bandwidthLastSevenDays",
        "bandwidthLast30Days",
        "bandwidthCalendarMonth",
        "bandwidthCurrentYear",
    )
}
BOT_STATS = BotStatsResponse(
    system=BotSystemStats(
        cpu_cores=4,
        memory_total=100,
        memory_used=50,
        memory_percent=50,
        uptime_seconds=100,
        version="0.1.0",
    ),
    users=BotUserStats(
        total_users=2,
        new_today=1,
        new_this_week=1,
        active_1h=1,
        active_24h=2,
    ),
    requests=BotRequestStats(total_requests=10, today_requests=2),
)


def _service(cached: bytes | None) -> tuple[DashboardService, AsyncMock, AsyncMock]:
    remnawave = AsyncMock()
    remnawave.get_system_stats = AsyncMock(return_value=SYSTEM_STATS)
    remnawave.get_bandwidth_stats = AsyncMock(return_value=BANDWIDTH)
    bot_stats = AsyncMock()
    bot_stats.collect = AsyncMock(return_value=BOT_STATS)
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=cached)
    redis.delete = AsyncMock()
    redis.set = AsyncMock()
    return DashboardService(remnawave, bot_stats, redis), remnawave, redis


@pytest.mark.asyncio
async def test_valid_cache_is_projected_without_provider_call() -> None:
    cached = json.dumps({"stats": SYSTEM_STATS, "bandwidth": BANDWIDTH}).encode()
    service, remnawave, redis = _service(cached)

    result = await service.get_dashboard()

    assert result.remnawave_stats is not None
    assert result.remnawave_stats.users.total_users == 2
    remnawave.get_system_stats.assert_not_awaited()
    redis.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_malformed_cache_is_evicted_and_refetched() -> None:
    service, remnawave, redis = _service(b'{"stats":{"private":"drift"}}')

    result = await service.get_dashboard()

    assert result.remnawave_bandwidth is not None
    redis.delete.assert_awaited_once_with(CACHE_KEY)
    remnawave.get_system_stats.assert_awaited_once()
    redis.set.assert_awaited_once()
