"""Schemas for admin dashboard API."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
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


class RemnawaveCpuStats(BaseModel):
    """Allow-listed CPU fields from Remnawave system stats."""

    cores: int = Field(ge=0)


class RemnawaveMemoryStats(BaseModel):
    """Allow-listed memory fields from Remnawave system stats."""

    total: int = Field(ge=0)
    free: int = Field(ge=0)
    used: int = Field(ge=0)


class RemnawaveUserStats(BaseModel):
    """Allow-listed user counts from Remnawave system stats."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    status_counts: dict[str, int]
    total_users: int = Field(ge=0)


class RemnawaveOnlineStats(BaseModel):
    """Allow-listed activity counts from Remnawave system stats."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    last_day: int = Field(ge=0)
    last_week: int = Field(ge=0)
    never_online: int = Field(ge=0)
    online_now: int = Field(ge=0)


class RemnawaveNodeStats(BaseModel):
    """Allow-listed node fields from Remnawave system stats."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    total_online: int = Field(ge=0)
    total_bytes_lifetime: str


class RemnawaveStats(BaseModel):
    """Locked dashboard projection of Remnawave GetStatsResponseDto."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    cpu: RemnawaveCpuStats
    memory: RemnawaveMemoryStats
    uptime: float = Field(ge=0)
    timestamp: float
    users: RemnawaveUserStats
    online_stats: RemnawaveOnlineStats
    nodes: RemnawaveNodeStats


class RemnawaveBandwidthPeriod(BaseModel):
    """One current/previous bandwidth comparison."""

    current: str
    previous: str
    difference: str


class RemnawaveBandwidth(BaseModel):
    """Locked dashboard projection of GetBandwidthStatsResponseDto."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    bandwidth_last_two_days: RemnawaveBandwidthPeriod
    bandwidth_last_seven_days: RemnawaveBandwidthPeriod
    bandwidth_last_30_days: RemnawaveBandwidthPeriod
    bandwidth_calendar_month: RemnawaveBandwidthPeriod
    bandwidth_current_year: RemnawaveBandwidthPeriod


class DashboardResponse(BaseModel):
    """GET /api/admin/dashboard response — both providers."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )

    remnawave_stats: RemnawaveStats | None
    remnawave_bandwidth: RemnawaveBandwidth | None
    bot: BotStatsResponse
