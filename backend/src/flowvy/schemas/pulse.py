"""Schemas for Pulse (Uptime Kuma status page) API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class PulseHeartbeat(BaseModel):
    """Single heartbeat entry from Kuma."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    status: int
    ping: int | None = None


class PulseMonitor(BaseModel):
    """Monitor with current status, uptime and heartbeat history."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: int
    name: str
    status: Literal["up", "down", "pending", "maintenance"]
    uptime_24h: float
    heartbeats: list[PulseHeartbeat]


class PulseGroup(BaseModel):
    """Named group of monitors."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str
    monitors: list[PulseMonitor]


class PulseIncident(BaseModel):
    """Active incident entry."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    title: str
    created_at: str


class PulseResponse(BaseModel):
    """GET /api/pulse response — aggregated status page data."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    overall_status: Literal["operational", "partial", "maintenance", "down"]
    groups: list[PulseGroup]
    incidents: list[PulseIncident]
