"""Schemas for admin dashboard API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class BotSystemStats(BaseModel):
    """Bot host system metrics."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    cpu_cores: int
    memory_total: int
    memory_used: int
    memory_percent: float
    uptime_seconds: float
    version: str


class BotUserStats(BaseModel):
    """Bot user activity metrics from DB."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    total_users: int
    new_today: int
    new_this_week: int
    active_1h: int
    active_24h: int


class BotRequestStats(BaseModel):
    """Bot API request counters from Redis."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    total_requests: int
    today_requests: int


class BotStatsResponse(BaseModel):
    """Aggregated bot-level metrics."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    system: BotSystemStats
    users: BotUserStats
    requests: BotRequestStats


class DashboardResponse(BaseModel):
    """GET /api/admin/dashboard response — both providers."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )

    remnawave_stats: dict[str, Any] | None
    remnawave_bandwidth: dict[str, Any] | None
    bot: BotStatsResponse
